import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { SessionService } from './session.service.js';
import { PostgresSessionStorage } from './session.storage.js';

describe('PostgreSQL-backed sessions', () => {
  it('shares validation and revocation between separate API service instances', async () => {
    const records = new Map<string, { sessionId: string; userId: string; tokenHash: string; payload: unknown; createdAt: string; revoked: boolean }>();
    const query = async (sql: string, args: unknown[] = []) => {
      if (sql.includes('INSERT INTO app_sessions')) {
        const [sessionId, userId, tokenHash, payload, , createdAt] = args;
        records.set(String(sessionId), { sessionId: String(sessionId), userId: String(userId), tokenHash: String(tokenHash), payload: JSON.parse(String(payload)), createdAt: String(createdAt), revoked: false });
        return [];
      }
      if (sql.includes('SELECT session_id')) {
        const record = records.get(String(args[0]));
        return record ? [{ sessionId: record.sessionId, tokenHash: record.tokenHash, payload: record.payload, createdAt: record.createdAt, revoked: record.revoked }] : [];
      }
      if (sql.includes('WHERE session_id') && sql.includes('UPDATE')) {
        const record = records.get(String(args[0]));
        if (record) record.revoked = true;
        return record ? [{ sessionId: record.sessionId }] : [];
      }
      if (sql.includes('WHERE user_id') && sql.includes('UPDATE')) {
        for (const record of records.values()) if (record.userId === args[0]) record.revoked = true;
        return [];
      }
      throw new Error('Unexpected SQL in session test');
    };
    const db = { query } as unknown as DataSource;
    const first = new SessionService(new PostgresSessionStorage(db));
    const second = new SessionService(new PostgresSessionStorage(db));
    const issued = await first.createSession({ sub: 'test-user', email: 'person@example.test', role: 'EMPLOYEE' });
    expect(records.get(issued.sessionId)?.tokenHash).not.toBe(issued.token);
    expect((await second.validateSession(issued.token)).valid).toBe(true);
    await second.revokeSession(issued.sessionId);
    expect((await first.validateSession(issued.token)).valid).toBe(false);
    const next = await second.createSession({ sub: 'test-user', email: 'person@example.test', role: 'EMPLOYEE' });
    await first.revokeSessionsForUser('test-user');
    expect((await second.validateSession(next.token)).valid).toBe(false);
  });
});
