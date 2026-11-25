import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AuthGuard } from '../../foundation/auth/auth.guard.js';
import { AuthorizationService } from '../../security/authorization/authorization.service.js';
import { inquiryApiPermission } from '../../foundation/permissions/inquiry-api-permission.js';
describe('Granular inquiry route authorization', () => {
  it.each([
    ['/inquiries', 'GET', 'list'],
    ['/inquiries', 'POST', 'create'],
    ['/inquiries/metadata', 'GET', 'list'],
    ['/inquiries/id', 'GET', 'list'],
    ['/inquiries/id', 'PATCH', 'update'],
    ['/inquiries/id/tasks/task', 'POST', 'followups'],
    ['/inquiries/import/preview', 'POST', 'import'],
    ['/inquiries/id/convert-service', 'POST', 'convert'],
  ])('maps %s %s to %s', (path, method, key) =>
    expect(inquiryApiPermission(path, method)).toBe(`crm.inquiries.${key}`),
  );
  it('distinguishes archive from lifecycle updates', () =>
    expect(
      inquiryApiPermission('/inquiries/id/action', 'POST', { archived: true }),
    ).toBe('crm.inquiries.archive'));
  it('allows a view-only per-user list grant without granting dashboard or writes', async () => {
    const request = {
      path: '/inquiries',
      method: 'GET',
      user: {
        userId: 'u',
        email: 'u@example.invalid',
        role: 'EMPLOYEE',
        branchId: 'a',
        branchIds: ['a'],
      },
    };
    const context = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const db = {
      query: vi
        .fn()
        .mockResolvedValue([
          { permission_key: 'crm.inquiries.list', effect: 'VIEW' },
        ]),
    } as unknown as DataSource;
    const guard = new AuthGuard(
      new Reflector(),
      new AuthorizationService(),
      db,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    request.path = '/inquiries/dashboard';
    await expect(guard.canActivate(context)).rejects.toThrow('permission');
    request.path = '/inquiries';
    request.method = 'POST';
    await expect(guard.canActivate(context)).rejects.toThrow('permission');
  });
});
