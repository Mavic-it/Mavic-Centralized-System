import type { MigrationInterface, QueryRunner } from 'typeorm';
export class LeaveBalanceReset1794787200000 implements MigrationInterface {
  name = 'LeaveBalanceReset1794787200000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE leave_balance_resets (
      employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
      next_date date,
      actor_id varchar(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      PRIMARY KEY(employee_id,type_id)
    );
    CREATE TABLE leave_balance_reset_runs (
      source_key varchar(200) PRIMARY KEY,
      employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
      credit_year integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );`);
  }
  down(): Promise<void> {
    throw new Error(
      'Preserve reset history; use a reviewed forward migration.',
    );
  }
}
