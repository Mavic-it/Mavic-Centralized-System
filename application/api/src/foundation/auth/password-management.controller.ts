import { Body, Controller, Get, Param, Post, Query, Req, ValidationPipe } from '@nestjs/common';
import { IsOptional, IsString, Length } from 'class-validator';
import { Public } from './auth.decorators.js';
import type { AuthenticatedRequest } from './auth.context.js';
import { PasswordManagementService } from './password-management.service.js';

class PasswordResetRequestDto {
  @IsString() @Length(1, 254) identifier!: string;
  @IsOptional() @IsString() @Length(0, 500) reason?: string;
}
class PasswordChangeDto {
  @IsString() @Length(1, 128) currentPassword!: string;
  @IsString() @Length(12, 128) newPassword!: string;
  @IsString() @Length(12, 128) confirmPassword!: string;
}
class RejectRequestDto { @IsString() @Length(1, 500) reason!: string; }

@Controller()
export class PasswordManagementController {
  constructor(private readonly service: PasswordManagementService) {}

  @Public() @Post('auth/password-reset-requests')
  request(@Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) input: PasswordResetRequestDto, @Req() request: AuthenticatedRequest) {
    const source = request.ip || request.socket.remoteAddress || 'unknown';
    return this.service.request(input.identifier, input.reason, source);
  }

  @Post('auth/change-password')
  change(@Req() request: AuthenticatedRequest, @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) input: PasswordChangeDto) {
    return this.service.changePassword(request.user!, input);
  }

  @Get('admin/password-reset-requests')
  list(@Req() request: AuthenticatedRequest, @Query('status') status?: string) { return this.service.list(request.user!, status); }

  @Post('admin/password-reset-requests/:id/approve')
  approve(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.service.approve(request.user!, id); }

  @Post('admin/password-reset-requests/:id/reject')
  reject(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) input: RejectRequestDto) { return this.service.reject(request.user!, id, input.reason); }

  @Post('admin/password-reset-requests/:id/issue-temporary-password')
  issue(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.service.issue(request.user!, id); }
}
