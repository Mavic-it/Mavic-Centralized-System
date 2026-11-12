export type PermissionAction =
  | 'VIEW'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'REJECT'
  | 'EXPORT'
  | 'IMPORT';
export type PermissionScope = 'OWN' | 'TEAM' | 'BRANCH' | 'ALL';
export type RoleName =
  | 'SUPER_ADMIN'
  | 'IT_ADMIN'
  | 'HR_ADMIN'
  | 'BRANCH_MANAGER'
  | 'STAFF'
  | 'EMPLOYEE';

export type AuthorizationRequest = {
  userId: string;
  role: RoleName;
  branchId: string;
  module: string;
  action: PermissionAction;
  scope: PermissionScope;
  resourceOwnerId?: string;
};

export type AuthorizationDecision = {
  allowed: boolean;
  reason?: string;
};

export class AuthorizationService {
  private readonly roleMatrix: Record<
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
      { module: 'employees', action: 'DELETE', scope: 'ALL' },
      { module: 'users', action: 'DELETE', scope: 'ALL' },
      { module: 'users', action: 'VIEW', scope: 'ALL' },
      { module: 'employees', action: 'CREATE', scope: 'ALL' },
      { module: 'users', action: 'CREATE', scope: 'ALL' },
      { module: 'users', action: 'UPDATE', scope: 'ALL' },
      { module: 'branches', action: 'VIEW', scope: 'ALL' },
      { module: 'branches', action: 'CREATE', scope: 'ALL' },
      { module: 'branches', action: 'UPDATE', scope: 'ALL' },
      { module: 'branches', action: 'DELETE', scope: 'ALL' },
      { module: 'employees', action: 'VIEW', scope: 'ALL' },
      { module: 'employees', action: 'UPDATE', scope: 'ALL' },
      { module: 'rooms', action: 'UPDATE', scope: 'ALL' },
      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
    ],
    IT_ADMIN: [
      { module: 'password_resets', action: 'VIEW', scope: 'ALL' },
      { module: 'password_resets', action: 'UPDATE', scope: 'ALL' },
      { module: 'users', action: 'DELETE', scope: 'ALL' },
      { module: 'users', action: 'VIEW', scope: 'ALL' },
      { module: 'users', action: 'CREATE', scope: 'ALL' },
      { module: 'users', action: 'UPDATE', scope: 'ALL' },
      { module: 'branches', action: 'VIEW', scope: 'ALL' },
      { module: 'branches', action: 'UPDATE', scope: 'ALL' },
      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
    ],
    HR_ADMIN: [
      { module: 'leave', action: 'VIEW', scope: 'ALL' },
      { module: 'leave', action: 'CREATE', scope: 'OWN' },
      { module: 'leave', action: 'UPDATE', scope: 'ALL' },
      { module: 'leave', action: 'APPROVE', scope: 'ALL' },

      { module: 'password_resets', action: 'VIEW', scope: 'ALL' },
      { module: 'password_resets', action: 'UPDATE', scope: 'ALL' },
      { module: 'password_resets', action: 'VIEW', scope: 'BRANCH' },
      { module: 'password_resets', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'employees', action: 'CREATE', scope: 'BRANCH' },
      { module: 'employees', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'branches', action: 'VIEW', scope: 'BRANCH' },
      { module: 'branches', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'employees', action: 'VIEW', scope: 'BRANCH' },
      { module: 'branches', action: 'VIEW', scope: 'ALL' },
      { module: 'branches', action: 'UPDATE', scope: 'ALL' },
      { module: 'employees', action: 'CREATE', scope: 'ALL' },
      { module: 'employees', action: 'UPDATE', scope: 'ALL' },
      { module: 'employees', action: 'VIEW', scope: 'ALL' },
      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
    ],
    BRANCH_MANAGER: [
      { module: 'leave', action: 'VIEW', scope: 'BRANCH' },
      { module: 'leave', action: 'APPROVE', scope: 'BRANCH' },
      { module: 'leave', action: 'CREATE', scope: 'OWN' },

      { module: 'password_resets', action: 'VIEW', scope: 'BRANCH' },
      { module: 'password_resets', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'branches', action: 'VIEW', scope: 'BRANCH' },
      { module: 'branches', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'employees', action: 'VIEW', scope: 'BRANCH' },
      { module: 'employees', action: 'CREATE', scope: 'BRANCH' },
      { module: 'employees', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'branches', action: 'VIEW', scope: 'ALL' },
      { module: 'branches', action: 'UPDATE', scope: 'ALL' },
      { module: 'employees', action: 'CREATE', scope: 'ALL' },
      { module: 'employees', action: 'UPDATE', scope: 'ALL' },
      { module: 'employees', action: 'VIEW', scope: 'ALL' },
      { module: 'rooms', action: 'VIEW', scope: 'BRANCH' },
      { module: 'rooms', action: 'UPDATE', scope: 'BRANCH' },
      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
    ],
    STAFF: [
      { module: 'leave', action: 'VIEW', scope: 'OWN' },
      { module: 'leave', action: 'CREATE', scope: 'OWN' },

      { module: 'rooms', action: 'VIEW', scope: 'BRANCH' },
      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
    ],
    EMPLOYEE: [
      { module: 'leave', action: 'VIEW', scope: 'OWN' },
      { module: 'leave', action: 'CREATE', scope: 'OWN' },

      { module: 'profile', action: 'VIEW', scope: 'OWN' },
      { module: 'profile', action: 'UPDATE', scope: 'OWN' },
    ],
  };

  authorize(request: AuthorizationRequest): AuthorizationDecision {
    const allowed = this.roleMatrix[request.role]?.some(
      (permission) =>
        permission.module === request.module &&
        permission.action === request.action &&
        permission.scope === request.scope,
    );

    if (allowed) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Role ${request.role} is not allowed to ${request.action} ${request.module} in ${request.scope} scope.`,
    };
  }
}
