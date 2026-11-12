import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AuthenticatedRequest, AuthUserContext } from '../foundation/auth/auth.context.js';
import { AuditController } from './audit/audit.controller.js';
import { AuditService } from './audit/audit.service.js';
import { SettingsController } from './settings/settings.controller.js';
import { SettingsService } from './settings/settings.service.js';

type Role = AuthUserContext['role'];
function request(role: Role, branchIds?: string[]): AuthenticatedRequest {
  return { user: {
    userId: 'test-actor', email: 'actor@example.test', role,
    branchId: branchIds?.[0] ?? null,
    ...(branchIds ? { branchIds } : {}),
  } } as AuthenticatedRequest;
}

describe('system audit and settings authorization', () => {
  const query = vi.fn(async () => []);
  const db = { query } as unknown as DataSource;
  const audit = new AuditController(new AuditService(db));
  const settings = new SettingsController(new SettingsService(db));

  it('does not expose an HTTP endpoint for forging audit events', () => {
    expect(typeof (audit as unknown as { record?: unknown }).record).toBe('undefined');
  });

  it('rejects unauthenticated audit and settings requests', async () => {
    const anon = {} as AuthenticatedRequest;
    expect(() => audit.list(anon)).toThrow(UnauthorizedException);
    expect(() => settings.get(anon, 'branch-a', 'timezone')).toThrow(UnauthorizedException);
    expect(() => settings.set(anon, 'branch-a', 'timezone', { value: 'UTC' })).toThrow(UnauthorizedException);
  });

  it.each(['EMPLOYEE', 'STAFF', 'BRANCH_MANAGER'] as const)(
    'prevents %s from viewing audit logs', role => {
      expect(() => audit.list(request(role, ['branch-a']), 'branch-a')).toThrow(ForbiddenException);
    },
  );

  it('limits scoped HR audit reads to an explicitly authorized branch', async () => {
    query.mockClear();
    const hr = request('HR_ADMIN', ['branch-a']);
    expect(() => audit.list(hr)).toThrow(ForbiddenException);
    expect(() => audit.list(hr, 'branch-b')).toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
    await audit.list(hr, 'branch-a');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE branch_id = $1'), ['branch-a']);
  });

  it('allows system administrators to review all audit history', async () => {
    query.mockClear();
    await audit.list(request('SUPER_ADMIN'));
    await audit.list(request('IT_ADMIN'));
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('denies cross-branch access and blocks staff from editing settings', async () => {
    query.mockClear();
    const manager = request('BRANCH_MANAGER', ['branch-a']);
    const hr = request('HR_ADMIN', ['branch-a']);
    expect(() => settings.get(manager, 'branch-b', 'timezone')).toThrow(ForbiddenException);
    expect(() => settings.get(hr, 'branch-b', 'timezone')).toThrow(ForbiddenException);
    expect(() => settings.set(manager, 'branch-a', 'timezone', { value: 'UTC' })).toThrow(ForbiddenException);
    expect(() => settings.set(hr, 'branch-a', 'timezone', { value: 'UTC' })).toThrow(ForbiddenException);
    expect(() => settings.get(request('STAFF', ['branch-a']), 'branch-a', 'timezone')).toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
    await settings.get(manager, 'branch-a', 'timezone');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM branch_settings'), ['branch-a', 'timezone']);
  });

  it('accepts authorized administrative changes and validates payloads', async () => {
    query.mockClear();
    const admin = request('IT_ADMIN');
    expect(() => settings.set(admin, 'branch-a', 'timezone', {})).toThrow(BadRequestException);
    expect(() => settings.set(admin, 'branch-a', 'timezone', { value: { unsafe: true } })).toThrow(BadRequestException);
    expect(() => settings.set(admin, 'branch-a', 'bad key', { value: 'UTC' })).toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    await settings.set(admin, 'branch-a', 'timezone', { value: 'Asia/Manila' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO branch_settings'), ['branch-a', 'timezone', '"Asia/Manila"']);
  });
});
