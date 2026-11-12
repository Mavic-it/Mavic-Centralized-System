import { randomUUID } from 'node:crypto';

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
      JSON.stringify({ typ: 'mspaces.session', alg: 'none' }),
    ).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        sessionId,
        ...normalized,
        iat: issuedAt,
      }),
    ).toString('base64url');
    const signature = Buffer.from('mspaces-session').toString('base64url');
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
      const body = segments.length === 3 ? segments[1] : token;
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
