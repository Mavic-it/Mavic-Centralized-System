import { HttpException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Bounded per-process limiter; configure an upstream shared limiter for multiple API replicas. */
@Injectable()
export class PublicBookingGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; expires: number }>();
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    for (const [key, bucket] of this.buckets) if (bucket.expires <= now) this.buckets.delete(key);
    const write = req.method === 'POST';
    const key = `${req.ip ?? req.socket.remoteAddress}:${write}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= 10000) throw new HttpException('Booking is busy. Please try again shortly.', 429);
      bucket = { count: 0, expires: now + 60000 };
      this.buckets.set(key, bucket);
    }
    if (++bucket.count > (write ? 8 : 90)) throw new HttpException('Too many requests. Please try again in one minute.', 429);
    return true;
  }
}
