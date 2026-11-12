import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from './session.service.js';
import { AuthService } from './auth.service.js';

describe('MSPACES hardened auth session service', () => {
  afterEach(() => vi.useRealTimers());

  it('expires sessions and cookies after exactly 24 hours without extending branch replacements', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
    const service = new SessionService();
    const auth = new AuthService(undefined, undefined, undefined, undefined, service);
    const session = await service.createSession({
      sub: 'user-1', email: 'user@example.test', role: 'EMPLOYEE',
    });
    expect(session.payload.expiresAt).toBe('2026-10-16T00:00:00.000Z');
    expect(auth.createSessionCookie(session.token)).toContain('Max-Age=86400');
    vi.advanceTimersByTime(12 * 60 * 60 * 1000);
    const replacement = await service.createSession(session.payload);
    expect(auth.createSessionCookie(replacement.token)).toContain('Max-Age=43200');
    vi.advanceTimersByTime(12 * 60 * 60 * 1000 - 1);
    expect((await service.validateSession(session.token)).valid).toBe(true);
    vi.advanceTimersByTime(1);
    expect(await service.validateSession(session.token)).toEqual({ valid: false, reason: 'session_expired' });
    expect((await service.validateSession(replacement.token)).valid).toBe(false);
    expect(auth.createSessionCookie(session.token)).toContain('Max-Age=0');
  });
  it('rejects fabricated or altered branch claims instead of trusting decoded token data', async () => {
    const service = new SessionService();
    const session = await service.createSession({
      sub: 'manager-1', email: 'manager@example.test', role: 'BRANCH_MANAGER',
      branchId: 'branch-1', scope: 'BRANCH',
    });
    const parts = session.token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    payload.branchId = 'other-branch';
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(await service.validateSession(parts.join('.')).valid).toBe(false);
    expect(JSON.parse(Buffer.from(session.token.split('.')[0], 'base64url').toString('utf8')).alg).toBe('HS256');
    const signatureParts = session.token.split('.');
    signatureParts[2] = Buffer.from('invalid-signature').toString('base64url');
    expect(await service.validateSession(signatureParts.join('.')).valid).toBe(false);
    expect((await new SessionService().validateSession(session.token)).valid).toBe(false);
  });
  it('creates a valid session and rejects expired or revoked sessions', async () => {
    const service = new SessionService();

    const session = await service.createSession({
      sub: 'user-1',
      email: 'manager@mspaces.test',
      role: 'BRANCH_MANAGER',
      branchId: 'branch-1',
      scope: 'BRANCH',
    });

    expect((await service.validateSession(session.token)).valid).toBe(true);
    await service.revokeSession(session.sessionId);
    expect((await service.validateSession(session.token)).valid).toBe(false);

    const expired = await service.createSession({
      sub: 'user-2',
      email: 'staff@mspaces.test',
      role: 'EMPLOYEE',
      branchId: 'branch-1',
      scope: 'BRANCH',
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });

    vi.useFakeTimers(); vi.advanceTimersByTime(2000);
    expect((await service.validateSession(expired.token)).valid).toBe(false);
  });
});
