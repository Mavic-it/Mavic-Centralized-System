import { HttpException, Injectable, Inject, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RateLimiter } from '../../security/persistent-rate-limiter.js';
import { PostgresRateLimiter } from '../../security/persistent-rate-limiter.js';

/** Atomic shared booking limits; do not rely on per-process counters. */
@Injectable()
export class PublicBookingGuard implements CanActivate {
  constructor(@Inject(PostgresRateLimiter) private readonly limiter: RateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    // Express's req.ip uses the configured trusted-proxy policy (not untrusted headers).
    const source = req.ip || req.socket?.remoteAddress || 'unknown';
    const write = req.method === 'POST';
    const allowed = await this.limiter.consume('public-booking-' + (write ? 'write' : 'read'), source, write ? 8 : 90, 60);
    if (!allowed) {
      throw new HttpException('Too many requests. Please try again in one minute.', 429);
    }
    return true;
  }
}
