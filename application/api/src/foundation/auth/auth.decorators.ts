import { SetMetadata } from '@nestjs/common';
import type {
  PermissionAction,
  PermissionScope,
} from '../../security/authorization/authorization.service.js';

export const AUTH_PUBLIC_KEY = 'mspaces:auth_public';
export const AUTH_PERMISSION_KEY = 'mspaces:auth_permission';

export type PermissionRequirement = {
  module: string;
  action: PermissionAction;
  scope: PermissionScope;
  branchParam?: string;
};

export const Public = () => SetMetadata(AUTH_PUBLIC_KEY, true);

export const RequirePermission = (
  module: string,
  action: PermissionAction,
  scope: PermissionScope,
  branchParam?: string,
) =>
  SetMetadata(AUTH_PERMISSION_KEY, {
    module,
    action,
    scope,
    branchParam,
  } satisfies PermissionRequirement);
