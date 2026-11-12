import type { DataSource } from 'typeorm';
import type { SessionStorage, StoredSession } from './session.service.js';

type DatabaseSessionRow = {
  sessionId: string;
  tokenHash: string;
  payload: StoredSession['payload'];
  revoked: boolean;
  createdAt: Date | string;
};

export class PostgresSessionStorage implements SessionStorage {
  constructor(private readonly db: Pick<DataSource, 'query'>) {}

  async create(record: StoredSession): Promise<void> {
    await this.db.query(
      `INSERT INTO app_sessions (session_id, user_id, token_hash, payload, expires_at, created_at)
       VALUES ($1::uuid, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)`,
      [record.sessionId, record.payload.sub, record.tokenHash, JSON.stringify(record.payload), record.payload.expiresAt, record.createdAt],
    );
  }

  async get(sessionId: string): Promise<StoredSession | undefined> {
    const rows = await this.db.query<DatabaseSessionRow[]>(
      `SELECT session_id AS "sessionId", token_hash AS "tokenHash", payload,
              (revoked_at IS NOT NULL) AS "revoked", created_at AS "createdAt"
       FROM app_sessions WHERE session_id = $1::uuid`,
      [sessionId],
    );
    const record = rows[0];
    return record ? {
      sessionId: record.sessionId,
      tokenHash: record.tokenHash,
      payload: record.payload,
      revoked: record.revoked,
      createdAt: new Date(record.createdAt).toISOString(),
    } : undefined;
  }

  async revoke(sessionId: string): Promise<boolean> {
    const rows = await this.db.query<{ sessionId: string }[]>(
      `UPDATE app_sessions SET revoked_at = COALESCE(revoked_at, now())
       WHERE session_id = $1::uuid RETURNING session_id AS "sessionId"`,
      [sessionId],
    );
    return rows.length > 0;
  }

  async revokeForUser(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE app_sessions SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }
}

// Unit-test-only adapter. Production MUST inject PostgresSessionStorage.
export class InMemorySessionStorage implements SessionStorage {
  private readonly records = new Map<string, StoredSession>();

  async create(record: StoredSession): Promise<void> {
    this.records.set(record.sessionId, { ...record, payload: { ...record.payload } });
  }
  async get(id: string): Promise<StoredSession | undefined> {
    const record = this.records.get(id);
    return record && { ...record, payload: { ...record.payload } };
  }
  async revoke(id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record) return false;
    record.revoked = true;
    return true;
  }
  async revokeForUser(id: string): Promise<void> {
    for (const record of this.records.values()) if (record.payload.sub === id) record.revoked = true;
  }
}
