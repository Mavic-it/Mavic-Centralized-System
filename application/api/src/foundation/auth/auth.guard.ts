import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.context.js';
import {
  AUTH_PERMISSION_KEY,
  AUTH_PUBLIC_KEY,
  type PermissionRequirement,
} from './auth.decorators.js';
import { includesBranch } from './branch-scope.js';
import { AuthorizationService } from '../../security/authorization/authorization.service.js';
import type { DataSource } from 'typeorm';
import { MODULE_PERMISSION_REGISTRY, defaultModuleAccess, registryEntry } from '../permissions/module-registry.js';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Inject } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
    @Inject(getDataSourceToken()) private readonly dataSource?: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      AUTH_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const path = request.path ?? '';
    const restrictedPasswordSession = user.mustChangePassword &&
      !(path === '/auth/me' || path === '/auth/change-password' || path === '/auth/logout');
    if (restrictedPasswordSession) {
      throw new ForbiddenException('Change your temporary password before continuing.');
    }

    const employeePath = path.match(/^\/employees\/([^/]+)(?:\/.*)?$/)?.[1];
    const isEmployeeProfilePath = Boolean(employeePath && !['me','account-options','document-requirements'].includes(employeePath));
    const registeredPathKey = isEmployeeProfilePath ? 'hr.employee-profile'
      : [...MODULE_PERMISSION_REGISTRY].sort((a,b)=>b.path.length-a.path.length).find(item => item.path !== '/' && (path === item.path || path.startsWith(`${item.path}/`)))?.key;
    // Self-service APIs share controller prefixes with administrator endpoints.
    // Keep their permission keys aligned with the employee portal instead of
    // inheriting the broader directory or management-page ceiling.
    const selfEmployeeDataPath =
      request.method === 'GET' && (
        /^\/employees\/[^/]+$/.test(path) ||
        /^\/employees\/[^/]+\/(?:assignment-history|hr-profile|document-records(?:\/[^/]+\/file)?|workflow\/(?:work-schedule(?:\/week)?|document-checklist)|profile-picture(?:\/.*)?)$/.test(path)
      ) ||
      request.method === 'PATCH' && /^\/employees\/[^/]+\/(?:emergency-contact|hr-profile)$/.test(path) ||
      ['POST','DELETE'].includes(request.method ?? '') && /^\/employees\/[^/]+\/profile-picture(?:\/.*)?$/.test(path);
    const ownEmployeeResourceId = selfEmployeeDataPath ? employeePath : undefined;
    let ownEmployeeResource = false;
    if (ownEmployeeResourceId && this.dataSource) {
      const [account] = await this.dataSource.query<{employeeId:string|null}[]>(`SELECT COALESCE(u.employee_id,e.id) AS "employeeId" FROM users u LEFT JOIN employees e ON lower(e.email)=lower(u.email) WHERE u.id=$1 LIMIT 1`,[user.userId]);
      ownEmployeeResource = account?.employeeId === ownEmployeeResourceId;
    }
    const workModuleKey = path.match(/^\/work\/(tasks|incidents)(?:\/|$)/)?.[1];
    const leaveDetailId = request.method === 'GET'
      ? path.match(/^\/leave\/requests\/([0-9a-f-]{36})(?:\/document)?$/i)?.[1]
      : undefined;
    let ownLeaveResource = false;
    if (leaveDetailId && this.dataSource) {
      const [owned] = await this.dataSource.query<{ id: string }[]>(
        'SELECT r.id FROM leave_requests r JOIN users u ON u.employee_id=r.employee_id WHERE r.id=$1::uuid AND u.id=$2',
        [leaveDetailId, user.userId],
      );
      ownLeaveResource = Boolean(owned);
    }
    const pathKey = ownEmployeeResource || path === '/employees/me' || path.startsWith('/employees/me/') ? 'people.my-portal'
      : ['/attendance/me','/attendance/clock-in','/attendance/clock-out'].includes(path) || path.startsWith('/attendance/official-business/') && !['SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER'].includes(user.role) ? 'people.my-portal'
      : ownLeaveResource || path === '/leave/me' || path.startsWith('/leave/me/') ? 'people.my-leave'
      : /^\/reservations\/payment-(accounts|policy)(?:\/|$)/.test(path) ? 'operations.reservations.settings'
      : path === '/reservations' || path.startsWith('/reservations/') && !/^\/reservations\/(spaces|reports|settings)(?:\/|$)/.test(path) ? 'operations.reservations.list'
      : path.startsWith('/users/module-access') ? 'system.module-access'
      : path === '/users' || (path.startsWith('/users/') && !path.startsWith('/users/me/')) ? 'system.users'
      : path.startsWith('/admin/password-reset-requests') ? 'system.password-resets'
      : workModuleKey ? `work.${workModuleKey}`
      : registeredPathKey;
    let moduleAccessMode: 'VIEW'|'EDIT'|'DENY'|undefined;
    let hasExplicitModuleGrant = false;
    if (pathKey) {
      const entry = MODULE_PERMISSION_REGISTRY.find(item => item.key === pathKey);
      const overrides = user.role === 'SUPER_ADMIN' ? [] : await this.dataSource?.query<{permission_key:string;effect:'ALLOW'|'VIEW'|'EDIT'|'DENY'}[]>(`SELECT permission_key,effect FROM user_module_permissions WHERE user_id=$1`,[user.userId]) ?? [];
      const overrideByKey = new Map(overrides.map(override => [override.permission_key,override.effect]));
      let current = entry;
      while (current) {
        const effect = current.critical ? undefined : overrideByKey.get(current.key);
        const explicitGrant = !current.critical && (effect === 'VIEW' || effect === 'EDIT' || effect === 'ALLOW');
        if (current.key === pathKey && !current.ceiling.includes(user.role) && !explicitGrant) throw new ForbiddenException('Insufficient permission');
        const defaultMode = defaultModuleAccess(current, user.role);
        const mode = effect === 'DENY' ? 'DENY'
          : explicitGrant && effect === 'VIEW' ? 'VIEW'
          : explicitGrant && (effect === 'EDIT' || effect === 'ALLOW') ? 'EDIT'
          : defaultMode;
        if (mode === 'DENY' && (current.key === pathKey || effect === 'DENY')) throw new ForbiddenException(effect === 'DENY' ? 'Module access denied' : 'Insufficient permission');
        if (current.key === pathKey) {
          moduleAccessMode = mode;
          hasExplicitModuleGrant = explicitGrant;
        }
        current = current.parentKey ? registryEntry(current.parentKey) : undefined;
      }
      const isMutation = !['GET','HEAD','OPTIONS'].includes(request.method ?? 'GET');
      const isReadOnlyPreview = path.endsWith('/preview');
      if (moduleAccessMode === 'VIEW' && isMutation && !isReadOnlyPreview) throw new ForbiddenException('View-only module access');
      if (moduleAccessMode !== 'DENY') {
        user.moduleAccessKey = pathKey;
        user.moduleAccessMode = moduleAccessMode;
      }
    }

    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(
      AUTH_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) {
      return true;
    }

    const rawBranchId = requirement.branchParam
      ? (request.params?.[requirement.branchParam] ??
        request.body?.[requirement.branchParam] ??
        request.query?.[requirement.branchParam])
      : undefined;
    const requestedBranchId = Array.isArray(rawBranchId)
      ? rawBranchId[0]
      : rawBranchId;

    if (requirement.scope === 'BRANCH') {
      if (
        (!user.branchId && !user.branchIds?.length) ||
        (requestedBranchId && !includesBranch(user, requestedBranchId))
      ) {
        throw new ForbiddenException('Branch access denied');
      }
    }

    const decision = this.authorization.authorize({
      userId: user.userId,
      role: user.role,
      branchId: requestedBranchId ?? user.branchId ?? 'ALL',
      module: requirement.module,
      action: requirement.action,
      scope: requirement.scope,
    });

    const grantScopeIsBounded = requirement.scope === 'OWN' || requirement.scope === 'BRANCH' || Boolean(user.allBranches);
    const userModuleGrantAllowsAction = hasExplicitModuleGrant && grantScopeIsBounded && (
      moduleAccessMode === 'EDIT' || (moduleAccessMode === 'VIEW' && requirement.action === 'VIEW')
    );
    if (!decision.allowed && !userModuleGrantAllowsAction) {
      throw new ForbiddenException('Insufficient permission');
    }

    return true;
  }
}
