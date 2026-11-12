import { Controller } from '@nestjs/common';
import { RoleService, type RoleName } from './role.service.js';

@Controller('roles')
export class RoleController {
  constructor(private readonly service: RoleService) {}

  permissions(role: RoleName) {
    return this.service.listPermissions(role);
  }
}
