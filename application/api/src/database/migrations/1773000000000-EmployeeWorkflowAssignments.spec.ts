import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeWorkflowAssignments1773000000000 } from './1773000000000-EmployeeWorkflowAssignments.js';

describe('EmployeeWorkflowAssignments migration', () => {
  it('adds supervisor, schedule, and document requirement relationships additively', async () => {
    const query = vi.fn(async (_sql: string) => undefined);
    await new EmployeeWorkflowAssignments1773000000000().up({
      query,
    } as unknown as QueryRunner);
    const statements = query.mock.calls.map(([sql]) => String(sql));
    const schema = statements.join('\n');

    expect(schema).toContain('manager_employee_id varchar(100)');
    expect(schema).toContain('REFERENCES employees(id) ON DELETE RESTRICT');
    expect(schema).toContain('employee_work_schedule_history');
    expect(schema).toContain('employee_document_requirements');
    expect(schema).toContain(
      'REFERENCES employee_document_requirements(id) ON DELETE SET NULL',
    );
    expect(schema).toContain('HAVING count(*) = 1');
    expect(schema).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    await expect(
      new EmployeeWorkflowAssignments1773000000000().down(),
    ).resolves.toBeUndefined();
  });
});
