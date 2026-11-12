import { Controller } from '@nestjs/common';
import { PermissionService } from './permission.service.js';
import type {
  PermissionAction,
  PermissionScope,
  RoleName,
} from '../roles/role.service.js';

@Controller('permissions')
export class PermissionController {
  constructor(private readonly service: PermissionService) {}

  check(
    role: RoleName,
    module: string,
    action: PermissionAction,
    scope: PermissionScope,
  ) {
    return { allowed: this.service.can(role, module, action, scope) };
  }
}
