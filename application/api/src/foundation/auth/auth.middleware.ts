import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest, AuthUserContext } from './auth.context.js';
import { AuthService } from './auth.service.js';

export class AuthMiddleware {
  constructor(private readonly authService: AuthService) {}

  async use(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const cookieHeader = req.headers.cookie;
    const token = this.authService.readSessionCookie(cookieHeader);

    if (!token) {
      res.clearCookie('mspaces_session', { path: '/', httpOnly: true, sameSite: 'lax' });
      next();
      return;
    }

    let validation;
    try {
      validation = await this.authService.validateWorkspaceSession(token);
    } catch {
      next();
      return;
    }

    if (!validation.valid) {
      res.clearCookie('mspaces_session', { path: '/', httpOnly: true, sameSite: 'lax' });
      next();
      return;
    }

    const payload = validation.payload;
    if (payload) {
      const security = await this.authService.getPasswordSecurityState(payload.sub);
      req.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role as AuthUserContext['role'],
        branchId: payload.branchId ?? null,
        branchIds: payload.branchIds,
        allBranches: payload.allBranches,
        scope: payload.scope,
        expiresAt: payload.expiresAt,
        mustChangePassword: security.mustChangePassword,
      };
    }
    next();
  }
}
