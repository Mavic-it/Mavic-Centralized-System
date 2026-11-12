import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';

/** Atomic, shared fixed-window protection for all application replicas. */
export interface RateLimiter {
  consume(namespace: string, identity: string, limit: number, windowSeconds: number): Promise<boolean>;
  reset(namespace: string, identity: string): Promise<void>;
}
function keyFor(namespace: string, identity: string): string {
  return createHash('sha256').update(namespace).update('\0').update(identity).digest('hex');
}
export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly db: Pick<DataSource, 'query'>) {}

  async consume(namespace: string, identity: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) {
      throw new Error('Invalid rate limit settings');
    }
    const rows = await this.db.query<Array<{ count: number }>>(`
      INSERT INTO api_rate_limit (bucket_key, request_count, expires_at)
      VALUES ($1, 1, now() + ($2::integer * interval '1 second'))
      ON CONFLICT (bucket_key) DO UPDATE
      SET request_count = CASE WHEN api_rate_limit.expires_at <= now() THEN 1
                               ELSE api_rate_limit.request_count + 1 END,
          expires_at = CASE WHEN api_rate_limit.expires_at <= now()
                            THEN now() + ($2::integer * interval '1 second')
                            ELSE api_rate_limit.expires_at END
      RETURNING request_count AS count`,
      [keyFor(namespace, identity), windowSeconds],
    );
    return Number(rows[0]?.count) <= limit;
  }

  async reset(namespace: string, identity: string): Promise<void> {
    await this.db.query('DELETE FROM api_rate_limit WHERE bucket_key = $1', [keyFor(namespace, identity)]);
  }
}

/** Test-only adapter: production providers always use PostgresRateLimiter. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; expires: number }>();
  constructor() {
    if (process.env.NODE_ENV === 'production') throw new Error('Persistent rate limiter required in production');
  }
  async consume(namespace: string, identity: string, limit: number, windowSeconds: number): Promise<boolean> {
    const key = keyFor(namespace, identity);
    const prev = this.buckets.get(key);
    const now = Date.now();
    const bucket = !prev || prev.expires <= now ? { count: 0, expires: now + windowSeconds * 1000 } : prev;
    bucket.count++;
    this.buckets.set(key, bucket);
    return bucket.count <= limit;
  }
  async reset(namespace: string, identity: string): Promise<void> {
    this.buckets.delete(keyFor(namespace, identity));
  }
}
