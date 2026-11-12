import {
  Injectable,
  Inject,
  SetMetadata,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { tap } from 'rxjs';
import type { AuthenticatedRequest } from '../foundation/auth/auth.context.js';
import { RealtimeService } from './realtime.service.js';

const READ_ONLY = 'realtime:read-only';
export const RealtimeReadOnly = () => SetMetadata(READ_ONLY, true);

@Injectable()
export class RealtimeInterceptor implements NestInterceptor {
  constructor(
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const readOnly = this.reflector.getAllAndOverride<boolean>(READ_ONLY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const mutation =
      !!request.user &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      !/\/preview(?:\/|$)/.test(request.path) &&
      !readOnly;
    return next.handle().pipe(
      tap({
        complete: () => {
          if (
            mutation &&
            response.statusCode >= 200 &&
            response.statusCode < 300
          )
            this.realtime.changed();
        },
      }),
    );
  }
}
