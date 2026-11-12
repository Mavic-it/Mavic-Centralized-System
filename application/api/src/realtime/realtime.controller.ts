import {
  Controller,
  Inject,
  Req,
  Sse,
  HttpException,
  type MessageEvent,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Observable } from 'rxjs';
import { AuthService } from '../foundation/auth/auth.service.js';
import type {
  AuthenticatedRequest,
  AuthUserContext,
} from '../foundation/auth/auth.context.js';
import { RealtimeService } from './realtime.service.js';

@Controller('realtime')
export class RealtimeController {
  private readonly connections = new Map<string, number>();
  constructor(
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DataSource) private readonly db: DataSource,
  ) {}

  async authorized(token: string, user: AuthUserContext) {
    const result = await this.auth.validateWorkspaceSession(token);
    if (
      !result.valid ||
      result.payload?.sub !== user.userId ||
      result.payload.role !== user.role
    )
      return false;
    const rows = await this.db.query<Array<{ mustChangePassword: boolean }>>(
      `SELECT must_change_password AS "mustChangePassword" FROM users WHERE id=$1 AND role=$2 AND status='ACTIVE'`,
      [user.userId, user.role],
    );
    return rows.length === 1 && !rows[0].mustChangePassword;
  }

  @Sse('events')
  stream(@Req() request: AuthenticatedRequest): Observable<MessageEvent> {
    const user = request.user;
    const token = this.auth.readSessionCookie(request.headers.cookie);
    if (!user || !token)
      throw new HttpException('Authentication required.', 401);
    const count = this.connections.get(user.userId) ?? 0;
    if (count >= 6)
      throw new HttpException('Too many realtime connections.', 429);
    // Reserve on subscribe; the transport subscribes exactly once for this request.
    return new Observable<MessageEvent>((subscriber) => {
      const current = this.connections.get(user.userId) ?? 0;
      if (current >= 6) {
        subscriber.error(
          new HttpException('Too many realtime connections.', 429),
        );
        return;
      }
      this.connections.set(user.userId, current + 1);
      let checking = false;
      const subscription = this.realtime.changes.subscribe({
        next: () =>
          subscriber.next({ type: 'refresh', data: { refresh: true } }),
        complete: () => subscriber.complete(),
      });
      const check = async () => {
        if (checking || subscriber.closed) return;
        checking = true;
        try {
          if (!(await this.authorized(token, user))) subscriber.complete();
          else if (!subscriber.closed)
            subscriber.next({ type: 'ping', data: {} });
        } catch {
          subscriber.complete();
        } finally {
          checking = false;
        }
      };
      const timer = setInterval(() => void check(), 20_000);
      timer.unref();
      void check();
      return () => {
        clearInterval(timer);
        subscription.unsubscribe();
        const remaining = (this.connections.get(user.userId) ?? 1) - 1;
        if (remaining > 0) this.connections.set(user.userId, remaining);
        else this.connections.delete(user.userId);
      };
    });
  }
}
