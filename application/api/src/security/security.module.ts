import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../foundation/auth/auth.guard.js';
import { AuthorizationController } from './authorization/authorization.controller.js';
import { AuthorizationService } from './authorization/authorization.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule],
  controllers: [AuthorizationController],
  providers: [
    AuthorizationService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthorizationService],
})
export class SecurityModule {}
