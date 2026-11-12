import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import { DtrService } from './dtr.service.js';
import { DEFAULT_DTR_POLICY } from './dtr.types.js';

describe('DTR commit original metadata', () => {
  it.each([{ excluded: [] as string[] }, { excluded: ['unmapped-source'] }])('commits with excluded identities $excluded without changing original metadata', async ({ excluded }) => {
    const original = { kind: 'DAILY', pairing: 'STRICT', dateOrder: 'ISO', cutoff: { from: '2026-10-11', to: '2026-10-25' } };
    const batch = { id: 'batch', branchId: 'branch', template: original, status: 'PREVIEW', filename: 'source.csv', dates: [], sourceCount: 2 };
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('UPDATE attendance_import_batches') && sql.includes('template_snapshot='))
        throw new Error('Original attendance batch metadata is immutable');
      if (sql.includes('FROM attendance_import_batches') && sql.includes('FOR UPDATE')) return [batch];
      return [];
    });
    const manager = { query } as unknown as EntityManager;
    const service = new DtrService({ transaction: async (fn: (manager: EntityManager) => Promise<unknown>) => fn(manager) } as DataSource);
    const internal = service as unknown as {
      lock: (...args: unknown[]) => Promise<void>;
      mutable: (...args: unknown[]) => Promise<void>;
      persist: (...args: unknown[]) => Promise<void>;
      prepareImport: (...args: unknown[]) => Promise<unknown>;
    };
    vi.spyOn(service, 'requireManager').mockImplementation(() => {});
    vi.spyOn(internal, 'lock').mockResolvedValue();
    vi.spyOn(internal, 'mutable').mockResolvedValue();
    const persist = vi.spyOn(internal, 'persist').mockResolvedValue();
    vi.spyOn(internal, 'prepareImport').mockResolvedValue({
      cutoff: original.cutoff, mappings: new Map(),
      groups: new Map([['employee:2026-10-13', { employee: { id: 'employee' }, date: '2026-10-13', sources: [] }]]),
      getContext: async () => ({ schedule: null, policy: DEFAULT_DTR_POLICY, active: true, holiday: null, leaveUnits: 0 }),
      getOverride: () => ({}), unmapped: excluded.length, unmappedKeys: excluded, invalid: 0, outsideCutoff: 0,
    });
    const result = await service.commit({ userId: 'actor', email: 'test@example.test', role: 'SUPER_ADMIN' }, 'batch', {
      branchId: 'branch', ...original.cutoff, mappings: [], overlap: 'REJECT', reason: 'Reviewed partial import',
    });
    expect(result.saved).toBe(1);
    expect(persist).toHaveBeenCalledOnce();
    const calls = query.mock.calls as unknown as [string, unknown[]][];
    const update = calls.find(([sql]) => sql.startsWith('UPDATE attendance_import_batches'))!;
    expect(update[0]).not.toContain('template_snapshot');
    expect(original).not.toHaveProperty('excludedSourceKeys');
    const commitAudit = calls.find(([sql, params]) => sql.startsWith('INSERT INTO attendance_dtr_audit') && params[3] === 'COMMIT')!;
    expect(JSON.parse(commitAudit[1][7] as string)).toMatchObject({ id: 'batch', excludedSourceKeys: excluded });
  });
});
