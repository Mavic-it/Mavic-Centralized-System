import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { TaskAutomation1794355200000 } from './1794355200000-TaskAutomation.js';

describe('task automation migration', () => {
  it('adds scoped templates and bounded, idempotent recurring task series', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      return [];
    });
    await new TaskAutomation1794355200000().up({ query } as unknown as QueryRunner);
    const sql = statements.join('\n');
    expect(sql).toContain('branch_id varchar(100) REFERENCES branches(id) ON DELETE RESTRICT');
    expect(sql).toContain('created_by varchar(100) REFERENCES users(id) ON DELETE RESTRICT');
    expect(sql).toContain('REFERENCES employees(id) ON DELETE RESTRICT');
    expect(sql).toContain("CHECK(recurrence IN ('DAILY','WEEKLY','MONTHLY'))");
    expect(sql).toContain('work_tasks_series_occurrence_once');
    expect(sql).toContain('work_task_series_due ON work_task_series(next_occurrence,id) WHERE is_active');
    expect(sql).toContain('Daily office inspection');
    expect(sql).toContain('Room preparation');
  });

  it('does not roll back and discard task/template history', async () => {
    await expect(new TaskAutomation1794355200000().down()).rejects.toThrow(
      'Preserve generated task, template and recurrence history',
    );
  });
});
