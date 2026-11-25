import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { PostgresRateLimiter } from '../../security/persistent-rate-limiter.js';
@Injectable()
export class InquiryRateLimitGuard implements CanActivate {
  constructor(@Inject(PostgresRateLimiter) private readonly limiter: PostgresRateLimiter) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user)
      throw new UnauthorizedException('Authentication required.');
    const expensive = /\/(import|export)(\/|$)/.test(request.path ?? '');
    if (
      !(await this.limiter.consume(
        expensive ? 'inquiry-transfer' : 'inquiry-api',
        request.user.userId,
        expensive ? 10 : 180,
        60,
      ))
    )
      throw new HttpException(
        'Too many inquiry requests. Try again in a minute.',
        429,
      );
    return true;
  }
}
