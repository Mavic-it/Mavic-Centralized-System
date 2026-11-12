export type RoleName =
  | 'SUPER_ADMIN'
  | 'IT_ADMIN'
  | 'HR_ADMIN'
  | 'BRANCH_MANAGER'
  | 'STAFF'
  | 'EMPLOYEE';

export type PermissionScope = 'OWN' | 'TEAM' | 'BRANCH' | 'ALL';

export type PermissionAction =
  | 'VIEW'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'REJECT'
  | 'EXPORT'
  | 'IMPORT';

export class RoleService {
  private readonly rolePermissions: Record<
    RoleName,
    Array<{ module: string; action: PermissionAction; scope: PermissionScope }>
  > = {
    SUPER_ADMIN: [
      { module: 'leave', action: 'VIEW', scope: 'ALL' },
      { module: 'leave', action: 'CREATE', scope: 'OWN' },
      { module: 'leave', action: 'UPDATE', scope: 'ALL' },
      { module: 'leave', action: 'APPROVE', scope: 'ALL' },

      { module: 'password_resets', action: 'VIEW', scope: 'ALL' },
      { module: 'password_resets', action: 'UPDATE', scope: 'ALL' },
      ...(['VIEW','IMPORT','UPDATE','APPROVE','EXPORT'] as const).map(action => ({module:'attendance',action,scope:'ALL' as const})),
      { module: 'branches', action: 'VIEW', scope: 'ALL' },
      { module: 'branches', action: 'CREATE', scope: 'ALL' },
      { module: 'branches', action: 'UPDATE', scope: 'ALL' },
      { module: 'branches', action: 'DELETE', scope: 'ALL' },
      { module: 'employees', action: 'VIEW', scope: 'ALL' },
      { module: 'employees', action: 'CREATE', scope: 'ALL' },
      { module: 'employees', action: 'UPDATE', scope: 'ALL' },
      { module: 'employees', action: 'APPROVE', scope: 'ALL' },
      { module: 'rooms', action: 'VIEW', scope: 'ALL' },
      { module: 'rooms', action: 'UPDATE', scope: 'ALL' },
      { module: 'inquiries', action: 'VIEW', scope: 'ALL' },
      { module: 'inventory', action: 'VIEW', scope: 'ALL' },
      { module: 'system', action: 'VIEW', scope: 'ALL' },
      { module: 'users', action: 'VIEW', scope: 'ALL' },
      { module: 'users', action: 'CREATE', scope: 'ALL' },
      { module: 'users', action: 'UPDATE', scope: 'ALL' },
      { module: 'users', action: 'DELETE', scope: 'ALL' },
      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
    ],
    IT_ADMIN: [
      { module: 'password_resets', action: 'VIEW', scope: 'ALL' },
      { module: 'password_resets', action: 'UPDATE', scope: 'ALL' },
      { module: 'branches', action: 'VIEW', scope: 'ALL' },
      { module: 'users', action: 'VIEW', scope: 'ALL' },
      { module: 'roles', action: 'VIEW', scope: 'ALL' },
      { module: 'permissions', action: 'VIEW', scope: 'ALL' },
      { module: 'branches', action: 'UPDATE', scope: 'ALL' },
      { module: 'system', action: 'VIEW', scope: 'ALL' },
      { module: 'users', action: 'CREATE', scope: 'ALL' },
      { module: 'users', action: 'UPDATE', scope: 'ALL' },
      { module: 'users', action: 'DELETE', scope: 'ALL' },
      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
    ],
    HR_ADMIN: [
      { module: 'leave', action: 'VIEW', scope: 'ALL' },
      { module: 'leave', action: 'CREATE', scope: 'OWN' },
      { module: 'leave', action: 'UPDATE', scope: 'ALL' },
      { module: 'leave', action: 'APPROVE', scope: 'ALL' },

      ...(['BRANCH','ALL'] as const).flatMap(scope => ([{ module: 'password_resets', action: 'VIEW' as const, scope }, { module: 'password_resets', action: 'UPDATE' as const, scope }])),
      ...(['VIEW','IMPORT','UPDATE','APPROVE','EXPORT'] as const).flatMap(action => (['BRANCH','ALL'] as const).map(scope => ({module:'attendance',action,scope}))),
      { module: 'employees', action: 'CREATE', scope: 'BRANCH' },
      { module: 'branches', action: 'VIEW', scope: 'BRANCH' },
      { module: 'employees', action: 'VIEW', scope: 'BRANCH' },
      { module: 'employees', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'branches', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'branches', action: 'VIEW', scope: 'ALL' },
      { module: 'branches', action: 'UPDATE', scope: 'ALL' },
      { module: 'employees', action: 'VIEW', scope: 'ALL' },
      { module: 'employees', action: 'CREATE', scope: 'ALL' },
      { module: 'employees', action: 'UPDATE', scope: 'ALL' },
      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
      { module: 'attendance', action: 'VIEW', scope: 'BRANCH' },
    ],
    BRANCH_MANAGER: [
      { module: 'leave', action: 'VIEW', scope: 'BRANCH' },
      { module: 'leave', action: 'APPROVE', scope: 'BRANCH' },
      { module: 'leave', action: 'CREATE', scope: 'OWN' },

      { module: 'password_resets', action: 'VIEW', scope: 'BRANCH' },
      { module: 'password_resets', action: 'UPDATE', scope: 'BRANCH' },
      ...(['VIEW','IMPORT','UPDATE','APPROVE','EXPORT'] as const).map(action => ({module:'attendance',action,scope:'BRANCH' as const})),
      { module: 'branches', action: 'VIEW', scope: 'BRANCH' },
      { module: 'branches', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'employees', action: 'VIEW', scope: 'BRANCH' },
      { module: 'employees', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'employees', action: 'CREATE', scope: 'BRANCH' },
      { module: 'branches', action: 'VIEW', scope: 'ALL' },
      { module: 'branches', action: 'UPDATE', scope: 'ALL' },
      { module: 'employees', action: 'VIEW', scope: 'ALL' },
      { module: 'employees', action: 'CREATE', scope: 'ALL' },
      { module: 'employees', action: 'UPDATE', scope: 'ALL' },
      { module: 'branches', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'rooms', action: 'VIEW', scope: 'BRANCH' },
      { module: 'rooms', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'inquiries', action: 'VIEW', scope: 'BRANCH' },
      { module: 'inquiries', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
    ],
    STAFF: [
      { module: 'leave', action: 'VIEW', scope: 'OWN' },
      { module: 'leave', action: 'CREATE', scope: 'OWN' },

      { module: 'rooms', action: 'VIEW', scope: 'BRANCH' },
      { module: 'inquiries', action: 'CREATE', scope: 'BRANCH' },
      { module: 'inventory', action: 'VIEW', scope: 'BRANCH' },
      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
    ],
    EMPLOYEE: [
      { module: 'leave', action: 'VIEW', scope: 'OWN' },
      { module: 'leave', action: 'CREATE', scope: 'OWN' },

      { module: 'attendance', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
    ],
  };

  listPermissions(role: RoleName) {
    return this.rolePermissions[role] ?? [];
  }

  hasPermission(
    role: RoleName,
    module: string,
    action: PermissionAction,
    scope: PermissionScope,
  ): boolean {
    return (
      this.rolePermissions[role]?.some(
        (permission) =>
          permission.module === module &&
          permission.action === action &&
          permission.scope === scope,
      ) ?? false
    );
  }
}
