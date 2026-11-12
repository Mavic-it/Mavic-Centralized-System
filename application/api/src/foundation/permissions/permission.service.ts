import type {
  PermissionAction,
  PermissionScope,
  RoleName,
} from '../roles/role.service.js';
import { RoleService } from '../roles/role.service.js';

export class PermissionService {
  constructor(private readonly roles = new RoleService()) {}

  can(
    role: RoleName,
    module: string,
    action: PermissionAction,
    scope: PermissionScope,
  ): boolean {
    return this.roles.hasPermission(role, module, action, scope);
  }
}
