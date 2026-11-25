import { Controller, Get, Header, Query, Req, UnauthorizedException, UsePipes, ValidationPipe, Inject, HttpException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { PostgresRateLimiter } from '../security/persistent-rate-limiter.js';
import type { AuthenticatedRequest } from '../foundation/auth/auth.context.js';
import { AnalyticsQuery } from './analytics.dto.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('analytics')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService, @Inject(getDataSourceToken()) private readonly db: DataSource) {}
  private async user(request: AuthenticatedRequest) {
    if (!request.user) throw new UnauthorizedException('Authentication required.');
    if (!await new PostgresRateLimiter(this.db).consume('analytics-read', request.user.userId, 90, 60))
      throw new HttpException('Too many report requests. Try again in a minute.', 429);
    return request.user;
  }
  @Get('context') @Header('Cache-Control', 'private, no-store')
  async context(@Req() request: AuthenticatedRequest, @Query() query: AnalyticsQuery) { return this.service.context(await this.user(request), query); }
  @Get('data') @Header('Cache-Control', 'private, no-store')
  async data(@Req() request: AuthenticatedRequest, @Query() query: AnalyticsQuery) { return this.service.data(await this.user(request), query); }
}
