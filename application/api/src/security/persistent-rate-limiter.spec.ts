import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { PostgresRateLimiter } from './persistent-rate-limiter.js';
import { AuthService } from '../foundation/auth/auth.service.js';
import { UserService } from '../foundation/users/user.service.js';
import { UserController } from '../foundation/users/user.controller.js';
import { BranchService } from '../foundation/branches/branches.service.js';

describe('shared persistent rate limiting and password resets', () => {
  it('hashes identifying keys and uses atomic upsert across instances', async () => {
    const buckets = new Map<string, number>();
    const query = vi.fn(async (sql: string, args: unknown[]) => {
      if (sql.includes('INSERT INTO api_rate_limit')) {
        const key = String(args[0]);
        const count = (buckets.get(key) ?? 0) + 1;
        buckets.set(key, count);
        return [{count}];
      }
      if (sql.includes('DELETE FROM api_rate_limit')) {
        buckets.delete(String(args[0]));
        return [];
      }
      throw new Error('Unexpected SQL');
    });
    const db = { query } as unknown as DataSource;
    const first = new PostgresRateLimiter(db);
    const second = new PostgresRateLimiter(db);
    expect(await first.consume('auth-account','person@example.test',2,60)).toBe(true);
    expect(await second.consume('auth-account','person@example.test',2,60)).toBe(true);
    expect(await first.consume('auth-account','person@example.test',2,60)).toBe(false);
    const firstArgs = query.mock.calls[0][1];
    expect(String(firstArgs[0])).not.toContain('person@example.test');
    expect(String(firstArgs[0])).toHaveLength(64);
    await second.reset('auth-account','person@example.test');
    expect(await first.consume('auth-account','person@example.test',2,60)).toBe(true);
  });

  it('invalidates existing sessions after successful admin password reset', async () => {
    const userService = new UserService();
    const branches = new BranchService();
    const branch = await branches.create({name:'Branch A',code:'B-A',address:'Test',city:'Makati'});
    const auth = new AuthService(userService, undefined, undefined, branches);
    userService.create({
      id:'target',name:'Account',email:'target@example.test',
      role:'EMPLOYEE',branchId:branch.id,status:'ACTIVE',
      passwordHash:auth.hashPassword('OriginalPass123!'),
    });
    const controller = new UserController(userService,branches,auth);
    const token = await auth.login({email:'target@example.test',password:'OriginalPass123!'});
    expect((await auth.validateSession(token)).valid).toBe(true);
    const result = await controller.resetPassword(
      'target',
      {user:{userId:'admin',email:'admin@example.test',role:'SUPER_ADMIN',branchId:null}} as any,
      {password:'NewSecurePass123!'},
    );
    expect(result.success).toBe(true);
    expect((await auth.validateSession(token)).valid).toBe(false);
  });
});
