import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ModuleAccess1793836800000 } from './1793836800000-ModuleAccess.js';

describe('module access migration',()=>{
  it('creates unique user permissions with foreign keys, effect checks, and lookup indexes',async()=>{
    const statements:string[]=[];const query=vi.fn(async(sql:string)=>{statements.push(sql);return [];});
    await new ModuleAccess1793836800000().up({query} as unknown as QueryRunner);
    expect(statements[0]).toContain('REFERENCES users(id) ON DELETE CASCADE');
    expect(statements[0]).toContain("CHECK (effect IN ('ALLOW','DENY'))");
    expect(statements[0]).toContain('PRIMARY KEY(user_id, permission_key)');
    expect(statements[1]).toContain('permission_key');
    expect(statements[2]).toContain('updated_at');
    expect(statements[3]).toContain('actor_user_id varchar(100) NOT NULL REFERENCES users(id)');
    expect(statements[3]).toContain('branch_id varchar(100) REFERENCES branches(id) ON DELETE SET NULL');
    expect(statements[3]).toContain('old_value varchar(10)');
    expect(statements[4]).toContain('target_created');
  });
});
