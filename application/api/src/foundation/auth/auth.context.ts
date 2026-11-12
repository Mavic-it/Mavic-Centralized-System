import type { Request } from 'express';
import type {
  PermissionScope,
  RoleName,
} from '../../security/authorization/authorization.service.js';

export type AuthUserContext = {
  userId: string;
  email: string;
  role: RoleName;
  branchId: string | null;
  branchIds?: string[];
  allBranches?: boolean;
  scope?: PermissionScope;
  expiresAt?: string;
  mustChangePassword?: boolean;
  moduleAccessKey?: string;
  moduleAccessMode?: 'VIEW' | 'EDIT';
};

export type AuthenticatedRequest = Request & {
  user?: AuthUserContext;
  path?: string;
};
