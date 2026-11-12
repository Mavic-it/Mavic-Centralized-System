import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { SessionService } from './auth/session.service.js';
import { PostgresSessionStorage } from './auth/session.storage.js';
import { PasswordManagementController } from './auth/password-management.controller.js';
import { PasswordManagementService } from './auth/password-management.service.js';
import { BranchesController } from './branches/branches.controller.js';
import { BranchService } from './branches/branches.service.js';
import { DepartmentService } from './branches/departments.service.js';
import { PermissionController } from './permissions/permission.controller.js';
import { PermissionService } from './permissions/permission.service.js';
import { ModuleAccessController } from './permissions/module-access.controller.js';
import { ModuleAccessService } from './permissions/module-access.service.js';
import { RoleController } from './roles/role.controller.js';
import { RoleService } from './roles/role.service.js';
import { UserController } from './users/user.controller.js';
import { UserProfileController } from './users/user-profile.controller.js';
import { UserProfileService } from './users/user-profile.service.js';
import { UserService } from './users/user.service.js';
import { SecurityModule } from '../security/security.module.js';
import { EmailModule } from '../email/email.module.js';
import { EmailService } from '../email/email.service.js';
import { AccountProvisioningService } from './users/account-provisioning.service.js';

@Module({
  imports: [SecurityModule, EmailModule],
  controllers: [
    AuthController,
    PasswordManagementController,
    BranchesController,
    RoleController,
    PermissionController,
    ModuleAccessController,
    UserController,
    UserProfileController,
  ],
  providers: [
    {
      provide: BranchService,
      useFactory: (dataSource: DataSource) => new BranchService(dataSource),
      inject: [getDataSourceToken()],
    },
    {
      provide: DepartmentService,
      useFactory: (dataSource: DataSource) => new DepartmentService(dataSource),
      inject: [getDataSourceToken()],
    },
    RoleService,
    PermissionService,
    { provide: ModuleAccessService, useFactory: (dataSource: DataSource) => new ModuleAccessService(dataSource), inject: [getDataSourceToken()] },
    {
      provide: UserService,
      useFactory: (dataSource: DataSource) => new UserService(dataSource),
      inject: [getDataSourceToken()],
    },
    {
      provide: UserProfileService,
      useFactory: (dataSource: DataSource) =>
        new UserProfileService(dataSource),
      inject: [getDataSourceToken()],
    },
    { provide: SessionService, useFactory: (db: DataSource) => new SessionService(new PostgresSessionStorage(db)), inject: [getDataSourceToken()] },
    {
      provide: AuthService,
      useFactory: (
        users: UserService,
        roles: RoleService,
        permissions: PermissionService,
        branches: BranchService,
        sessions: SessionService,
      ) => new AuthService(users, roles, permissions, branches, sessions),
      inject: [UserService, RoleService, PermissionService, BranchService, SessionService],
    },
    {
      provide: AccountProvisioningService,
      useFactory: (dataSource: DataSource, users: UserService, auth: AuthService, email: EmailService) => new AccountProvisioningService(dataSource, users, auth, email),
      inject: [getDataSourceToken(), UserService, AuthService, EmailService],
    },
    {
      provide: PasswordManagementService,
      useFactory: (dataSource: DataSource, auth: AuthService, branches: BranchService, email: EmailService) =>
        new PasswordManagementService(dataSource, auth, branches, email),
      inject: [getDataSourceToken(), AuthService, BranchService, EmailService],
    },
  ],
  exports: [
    BranchService,
    DepartmentService,
    RoleService,
    PermissionService,
    UserService,
    AuthService,
  ],
})
export class FoundationModule {}
