import { describe, expect, it, vi } from 'vitest';
import { DataSource, type EntityManager } from 'typeorm';
import { DtrService } from './dtr.service.js';
import { DEFAULT_DTR_POLICY } from './dtr.types.js';

// Only temporary tables are written; every statement runs in a rolled-back transaction.
describe.runIf(process.env.DTR_COMMIT_DB_TEST === 'true')('DTR commit PostgreSQL immutability regression', () => {
  it('preserves originals and uses the latest commit exclusions for approval checks', async () => {
    process.loadEnvFile('.env');
    const db = new DataSource({ type: 'postgres', host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432), username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, synchronize: false });
    await db.initialize();
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`
        CREATE TEMP TABLE attendance_import_batches (
          id text PRIMARY KEY, branch_id text, template_snapshot jsonb, status text,
          committed_at timestamptz, filename text, dates jsonb, source_count int
        ) ON COMMIT DROP;
        CREATE TRIGGER original_guard BEFORE UPDATE ON attendance_import_batches
          FOR EACH ROW EXECUTE FUNCTION public.attendance_batch_original_immutable();
        CREATE TEMP TABLE attendance_source_rows (batch_id text, normalized jsonb) ON COMMIT DROP;
        CREATE TEMP TABLE employees (id text, branch_id text) ON COMMIT DROP;
        CREATE TEMP TABLE employee_biometric_mappings (branch_id text, source_key text, employee_id text) ON COMMIT DROP;
        CREATE TEMP TABLE attendance_records (id text, employee_id text, branch_id text, work_date date, dtr_data jsonb) ON COMMIT DROP;
        CREATE TEMP TABLE attendance_dtr_audit (id text, branch_id text, record_id text, action text, actor_id text, reason text, before_value jsonb, after_value jsonb, created_at timestamptz DEFAULT clock_timestamp()) ON COMMIT DROP;
        CREATE TEMP TABLE attendance_dtr_periods (id text, branch_id text, date_from date, date_to date, state text, actor_id text, updated_at timestamptz, UNIQUE(branch_id,date_from,date_to)) ON COMMIT DROP;
      `);
      const cutoff = { from: '2026-10-11', to: '2026-10-25' };
      const original = { kind: 'DAILY', dateOrder: 'ISO', pairing: 'STRICT', cutoff };
      await runner.query(`INSERT INTO attendance_import_batches VALUES ('batch','branch',$1::jsonb,'PREVIEW',NULL,'test.csv','[]',2)`, [JSON.stringify(original)]);
      await runner.query('SAVEPOINT expected_original_failure');
      await expect(runner.query(`UPDATE attendance_import_batches SET template_snapshot=jsonb_set(template_snapshot,'{excludedSourceKeys}','["skip"]') WHERE id='batch'`)).rejects.toThrow('Original attendance batch metadata is immutable');
      await runner.query('ROLLBACK TO SAVEPOINT expected_original_failure');
      await runner.query(`INSERT INTO attendance_source_rows VALUES ('batch','{"date":"2026-10-13","key":"mapped"}'),('batch','{"date":"2026-10-13","key":"skip"}')`);
      await runner.query(`INSERT INTO employees VALUES ('employee','branch'); INSERT INTO employee_biometric_mappings VALUES ('branch','mapped','employee')`);
      const scoped = { transaction: async <T>(fn: (manager: EntityManager) => Promise<T>) => fn(runner.manager) } as DataSource;
      const service = new DtrService(scoped);
      const internal = service as unknown as {
        lock: (...args: unknown[]) => Promise<void>;
        mutable: (...args: unknown[]) => Promise<void>;
        persist: (...args: unknown[]) => Promise<void>;
        prepareImport: (...args: unknown[]) => Promise<unknown>;
        unresolved: (manager: EntityManager, query: { branchId: string; from: string; to: string }) => Promise<number>;
      };
      vi.spyOn(service, 'requireManager').mockImplementation(() => {});
      vi.spyOn(internal, 'lock').mockResolvedValue();
      vi.spyOn(internal, 'mutable').mockResolvedValue();
      vi.spyOn(internal, 'persist').mockResolvedValue();
      vi.spyOn(internal, 'prepareImport').mockResolvedValue({ cutoff, mappings: new Map(),
        groups: new Map([['employee:2026-10-13', { employee: { id: 'employee' }, date: '2026-10-13', sources: [] }]]),
        getContext: async () => ({ schedule: null, policy: DEFAULT_DTR_POLICY, active: true, holiday: null, leaveUnits: 0 }),
        getOverride: () => ({}), unmapped: 1, unmappedKeys: ['skip'], invalid: 0, outsideCutoff: 0,
      });
      const result = await service.commit({ userId: 'actor', email: 'test@example.test', role: 'SUPER_ADMIN' }, 'batch', { branchId: 'branch', ...cutoff, mappings: [], overlap: 'REJECT', reason: 'Reviewed partial import' });
      expect(result.saved).toBe(1);
      const batches = await runner.query(`SELECT template_snapshot, status FROM attendance_import_batches WHERE id='batch'`);
      expect(batches[0]).toEqual({ template_snapshot: original, status: 'COMMITTED' });
      const audit = await runner.query(`SELECT after_value FROM attendance_dtr_audit WHERE action='COMMIT'`);
      expect(audit[0].after_value.excludedSourceKeys).toEqual(['skip']);
      const query = { branchId: 'branch', ...cutoff };
      expect(await internal.unresolved(runner.manager, query)).toBe(0);
      // A later commit supersedes earlier exclusions, including an empty set.
      await runner.query(`INSERT INTO attendance_dtr_audit(id,branch_id,action,after_value,created_at) VALUES ('newer','branch','COMMIT','{"id":"batch","excludedSourceKeys":[]}',clock_timestamp()+interval '1 second')`);
      expect(await internal.unresolved(runner.manager, query)).toBe(1);
      // Invalid dates still block approval even when their identity was excluded.
      await runner.query(`INSERT INTO attendance_source_rows VALUES ('batch','{"date":null,"key":"skip"}')`);
      expect(await internal.unresolved(runner.manager, query)).toBe(2);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
      await db.destroy();
    }
  });
});
