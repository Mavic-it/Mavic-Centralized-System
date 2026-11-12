import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { InMemorySessionStorage } from './session.storage.js';

export const SESSION_LIFETIME_SECONDS = 24 * 60 * 60;

export type SessionPayload = {
  sub: string;
  email: string;
  role: string;
  jti?: string;
  branchId?: string | null;
  branchIds?: string[];
  allBranches?: boolean;
  scope?: 'OWN' | 'TEAM' | 'BRANCH' | 'ALL';
  expiresAt?: string;
};

export type SessionRecord = {
  sessionId: string;
  token: string;
  payload: SessionPayload;
  revoked: boolean;
  createdAt: string;
};

export type StoredSession = Omit<SessionRecord, 'token'> & { tokenHash: string };
export interface SessionStorage {
  create(record: StoredSession): Promise<void>;
  get(sessionId: string): Promise<StoredSession | undefined>;
  revoke(sessionId: string): Promise<boolean>;
  revokeForUser(userId: string): Promise<void>;
}

export type SessionValidationResult = {
  valid: boolean;
  sessionId?: string;
  payload?: SessionPayload;
  reason?: string;
};

const developmentSecret = randomBytes(32).toString('hex');
function signingSecret(): string {
  const secret = process.env.SESSION_SIGNING_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || Buffer.byteLength(secret) < 32)) {
    throw new Error('SESSION_SIGNING_SECRET must be at least 32 bytes in production');
  }
  return secret || developmentSecret;
}
function sign(data: string): Buffer {
  return createHmac('sha256', signingSecret()).update(data).digest();
}
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SessionService {
  constructor(private readonly storage: SessionStorage = createTestStorage()) {
    signingSecret();
  }

  private decodeToken(token: string): { sessionId: string; payload: SessionPayload } | null {
    try {
      const segments = token.split('.');
      if (segments.length !== 3) return null;
      const [header, body, signature] = segments;
      const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
      if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'mspaces.session') return null;
      const actual = Buffer.from(signature, 'base64url');
      const expected = sign(`${header}.${body}`);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
      const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload & { sessionId?: string };
      if (!decoded.sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.sessionId)) return null;
      if (!decoded.sub || !decoded.email || !decoded.role || !decoded.expiresAt) return null;
      return { sessionId: decoded.sessionId, payload: decoded };
    } catch {
      return null;
    }
  }

  // Cookie lifetime only; authorization ALWAYS checks shared storage.
  cookieMaxAge(token: string): number {
    const decoded = this.decodeToken(token);
    if (!decoded) return 0;
    const expiry = Date.parse(decoded.payload.expiresAt!);
    return Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - Date.now()) / 1000)) : 0;
  }

  async createSession(payload: SessionPayload): Promise<SessionRecord> {
    const sessionId = randomUUID();
    const createdAt = new Date().toISOString();
    const normalized: SessionPayload = {
      ...payload,
      expiresAt: payload.expiresAt ?? new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000).toISOString(),
    };
    const expiry = Date.parse(normalized.expiresAt!);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      throw new Error('Cannot create an already expired session');
    }
    const header = Buffer.from(JSON.stringify({ typ: 'mspaces.session', alg: 'HS256' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sessionId, ...normalized, iat: createdAt })).toString('base64url');
    const unsigned = `${header}.${body}`;
    const token = `${unsigned}.${sign(unsigned).toString('base64url')}`;
    await this.storage.create({ sessionId, tokenHash: hashToken(token), payload: normalized, revoked: false, createdAt });
    return { sessionId, token, payload: normalized, revoked: false, createdAt };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.storage.revoke(sessionId);
  }

  async revokeSessionsForUser(userId: string): Promise<void> {
    await this.storage.revokeForUser(userId);
  }

  async validateSession(token: string): Promise<SessionValidationResult> {
    const decoded = this.decodeToken(token);
    if (!decoded) return { valid: false, reason: 'session_invalid_token' };
    const session = await this.storage.get(decoded.sessionId);
    if (!session || session.tokenHash !== hashToken(token)) return { valid: false, reason: 'session_unknown' };
    if (session.revoked) return { valid: false, reason: 'session_revoked' };
    const expiry = session.payload.expiresAt ? Date.parse(session.payload.expiresAt) : NaN;
    if (!Number.isFinite(expiry) || Date.now() >= expiry) return { valid: false, reason: 'session_expired' };
    if (!session.payload.sub || !session.payload.email || !session.payload.role ||
      session.payload.sub !== decoded.payload.sub ||
      session.payload.email !== decoded.payload.email ||
      session.payload.role !== decoded.payload.role) {
      return { valid: false, reason: 'session_invalid_payload' };
    }
    return { valid: true, sessionId: session.sessionId, payload: { ...session.payload } };
  }
}

function createTestStorage(): SessionStorage {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Persistent session storage is required in production');
  }
  return new InMemorySessionStorage();
}
