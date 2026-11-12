import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

// Production must configure a stable, high-entropy SESSION_SIGNING_SECRET.
const developmentSecret = randomBytes(32).toString('hex');
function signingSecret(): string {
  const secret = process.env.SESSION_SIGNING_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || Buffer.byteLength(secret) < 32)) {
    throw new Error('SESSION_SIGNING_SECRET must be at least 32 bytes in production');
  }
  return secret || developmentSecret;
}
function sign(data: string): string {
  return createHmac('sha256', signingSecret()).update(data).digest('base64url');
}

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

export type SessionValidationResult = {
  valid: boolean;
  sessionId?: string;
  payload?: SessionPayload;
  reason?: string;
};

export class SessionService {
  private readonly sessions = new Map<string, SessionRecord>();

  createSession(payload: SessionPayload): SessionRecord {
    const sessionId = randomUUID();
    const issuedAt = new Date().toISOString();
    const normalized: SessionPayload = {
      ...payload,
      expiresAt:
        payload.expiresAt ??
        new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000).toISOString(),
    };

    const header = Buffer.from(
      JSON.stringify({ typ: 'mspaces.session', alg: 'HS256' }),
    ).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        sessionId,
        ...normalized,
        iat: issuedAt,
      }),
    ).toString('base64url');
    const signature = sign(`${header}.${body}`);
    const token = `${header}.${body}.${signature}`;

    const session: SessionRecord = {
      sessionId,
      token,
      payload: normalized,
      revoked: false,
      createdAt: issuedAt,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  revokeSession(sessionId: string): SessionRecord | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    session.revoked = true;
    return session;
  }

  revokeSessionsForUser(userId: string): void {
    for (const session of this.sessions.values()) {
      if (session.payload.sub === userId) session.revoked = true;
    }
  }

  validateSession(token: string): SessionValidationResult {
    try {
      const segments = token.split('.');
      if (segments.length !== 3) return { valid: false, reason: 'session_invalid_token' };
      const [header, body, signature] = segments;
      const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as {alg?: string; typ?: string};
      if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'mspaces.session') return { valid: false, reason: 'session_invalid_token' };
      const expected = Buffer.from(sign(`${header}.${body}`));
      const supplied = Buffer.from(signature);
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return { valid: false, reason: 'session_invalid_token' };
      const decoded = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as SessionPayload & {
        sessionId?: string;
        iat?: string;
      };

      const session = decoded.sessionId
        ? this.sessions.get(decoded.sessionId)
        : undefined;
      if (!session || session.token !== token) {
        return { valid: false, reason: 'session_unknown' };
      }
      const expiry = session.payload.expiresAt
        ? new Date(session.payload.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;

      if (session?.revoked) {
        return { valid: false, reason: 'session_revoked' };
      }

      if (Number.isNaN(expiry) || Date.now() >= expiry) {
        return { valid: false, reason: 'session_expired' };
      }

      if (!decoded.sub || !decoded.email || !decoded.role) {
        return { valid: false, reason: 'session_invalid_payload' };
      }

      return {
        valid: true,
        sessionId: session.sessionId,
        payload: { ...session.payload },
      };
    } catch {
      return { valid: false, reason: 'session_invalid_token' };
    }
  }
}
