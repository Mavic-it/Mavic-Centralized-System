import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../foundation/auth/auth.context.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsQuery } from './analytics.dto.js';

describe('analytics HTTP boundary', () => {
  it('rejects missing sessions and rate limits authenticated reads', async () => {
    const query = vi.fn().mockResolvedValue([{ count: 91 }]);
    const data = vi.fn();
    const service = { data } as unknown as AnalyticsService;
    const controller = new AnalyticsController(service, { query } as unknown as DataSource);
    await expect(controller.data({} as AuthenticatedRequest, new AnalyticsQuery())).rejects.toThrow('Authentication required');
    expect(query).not.toHaveBeenCalled();
    const request = { user: { userId: 'u' }, path: '/analytics/data' } as AuthenticatedRequest;
    await expect(controller.data(request, new AnalyticsQuery())).rejects.toThrow('Too many report requests');
    expect(data).not.toHaveBeenCalled();
    query.mockResolvedValue([{ count: 1 }]);
    await controller.data(request, new AnalyticsQuery());
    expect(data).toHaveBeenCalledWith(request.user, expect.any(AnalyticsQuery));
  });
  it('validates query arrays, unknown fields and invalid paging before the service', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    for (const query of [{ branchId: ['a', 'b'] }, { rawSql: 'anything' }, { grouping: 'hour' }, { reservationPage: '0' }]) {
      await expect(pipe.transform(query, { type: 'query', metatype: AnalyticsQuery })).rejects.toThrow();
    }
    const valid = await pipe.transform({ mode: 'hr', reservationPage: '2' }, { type: 'query', metatype: AnalyticsQuery });
    expect(valid.reservationPage).toBe(2); expect(valid.category).toBe('all');
  });
});
