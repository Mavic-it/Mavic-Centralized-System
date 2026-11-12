import {
  Body,
  Controller,
  Get,
  Inject,
  Optional,
  Post,
  Req,
  Res,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from './auth.context.js';
import { Public } from './auth.decorators.js';
import { AuthService, type AuthLoginInput } from './auth.service.js';
import { BranchContextDto } from './branch-context.dto.js';
import type { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { MODULE_PERMISSION_REGISTRY, defaultModuleAccess } from '../permissions/module-registry.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, @Optional() @Inject(getDataSourceToken()) private readonly dataSource?: DataSource) {}

  @Get('me')
  currentUser(@Req() request: AuthenticatedRequest) {
    const user = request.user;
    if (!user) throw new UnauthorizedException('Authentication required');

    return this.dataSource ? this.currentUserWithPermissions(user) : {
      userId: user.userId,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      branchIds: user.branchIds,
      allBranches: user.allBranches,
      expiresAt: user.expiresAt,
      mustChangePassword: user.mustChangePassword ?? false,
    };
  }

  private async currentUserWithPermissions(user: NonNullable<AuthenticatedRequest['user']>) {
    const permissions = user.role === 'SUPER_ADMIN' ? [] : await this.dataSource!.query<{permissionKey:string;effect:'VIEW'|'EDIT'|'DENY'|'ALLOW'}[]>(`SELECT permission_key AS "permissionKey",effect FROM user_module_permissions WHERE user_id=$1 AND effect IN ('VIEW','EDIT','DENY','ALLOW')`,[user.userId]);
    const overrides = new Map(permissions.map(row => [row.permissionKey, row.effect]));
    const modes = new Map<string, 'VIEW'|'EDIT'|'DENY'>();
    for (const item of MODULE_PERMISSION_REGISTRY) {
      const effect = item.critical ? undefined : overrides.get(item.key);
      let mode = effect === 'ALLOW' ? 'EDIT' : effect ?? defaultModuleAccess(item, user.role);
      if (item.parentKey && overrides.get(item.parentKey) === 'DENY') mode = 'DENY';
      modes.set(item.key, mode);
    }
    // Navigation groups remain reachable when an explicitly granted child is
    // accessible; the backend still checks the child's key on each API call.
    for (const item of MODULE_PERMISSION_REGISTRY) {
      if (item.parentKey && modes.get(item.key) !== 'DENY' && modes.get(item.parentKey) === 'DENY' && overrides.get(item.parentKey) !== 'DENY') modes.set(item.parentKey, 'VIEW');
    }
    return { userId:user.userId,email:user.email,role:user.role,branchId:user.branchId,branchIds:user.branchIds,allBranches:user.allBranches,expiresAt:user.expiresAt,mustChangePassword:user.mustChangePassword??false,deniedPermissionKeys:[...modes].filter(([,mode])=>mode==='DENY').map(([key])=>key),grantedPermissionKeys:[...modes].filter(([,mode])=>mode!=='DENY').map(([key])=>key) };
  }

  @Get('branches')
  async branchAccess(@Req() request: AuthenticatedRequest) {
    if (!request.user) throw new UnauthorizedException('Authentication required');
    return {
      ...await this.authService.getBranchAccess(request.user.userId),
      activeBranchId: request.user.branchId,
      selectedBranchIds: request.user.branchIds ?? (request.user.branchId ? [request.user.branchId] : []),
      allBranches: request.user.allBranches ?? false,
    };
  }

  @Post('branch')
  async switchBranch(
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) input: BranchContextDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = this.authService.readSessionCookie(request.headers.cookie);
    if (!request.user || !token) throw new UnauthorizedException('Authentication required');
    const nextToken = await this.authService.switchBranchSelection(token, input);
    response.setHeader('Set-Cookie', this.authService.createSessionCookie(nextToken));
    return { ok: true, branchId: input.branchId };
  }

  @Post('login')
  @Public()
  async login(
    @Body() input: AuthLoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: boolean; message: string; mustChangePassword: boolean }> {
    const token = await this.authService.login(input);
    res.setHeader('Set-Cookie', this.authService.createSessionCookie(token));
    const session = this.authService.validateSession(token);
    const security = session.payload ? await this.authService.getPasswordSecurityState(session.payload.sub) : { mustChangePassword: false };

    return {
      ok: true,
      message: 'Authenticated successfully',
      mustChangePassword: security.mustChangePassword,
    };
  }

  @Post('logout')
  @Public()
  logout(
    @Req() req: Request & { headers?: { cookie?: string } },
    @Res({ passthrough: true }) res: Response,
  ): { ok: boolean; message: string } {
    const cookieHeader = req.headers?.cookie;
    const token = this.authService.readSessionCookie(cookieHeader);

    if (token) {
      this.authService.revokeSessionToken(token);
    }

    res.clearCookie('mspaces_session', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return {
      ok: true,
      message: 'Logged out successfully',
    };
  }
}
