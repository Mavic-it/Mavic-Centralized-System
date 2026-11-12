import { describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { AttendanceService } from './attendance.service.js';

// Temporary tables isolate fixtures from all real employee, schedule and leave data.
describe.runIf(process.env.DTR_SCHEDULE_DB_TEST === 'true')('Approved leave in weekly schedules', () => {
  it('shows approved working dates and half-days, removes cancelled leave, and preserves shifts', async () => {
    process.loadEnvFile('.env');
    const db = new DataSource({ type: 'postgres', host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432), username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, synchronize: false });
    await db.initialize();
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`
        CREATE TEMP TABLE employees (id text, employee_number text, name text, branch_id text, status text) ON COMMIT DROP;
        CREATE TEMP TABLE branches (id text, name text) ON COMMIT DROP;
        CREATE TEMP TABLE attendance_schedules (branch_id text, time_zone text, work_days smallint[], shift_start time, shift_end time, default_location text) ON COMMIT DROP;
        CREATE TEMP TABLE employee_work_schedule_history (employee_id text, branch_id text, time_zone text, work_days smallint[], shift_start time, shift_end time, effective_date date, recorded_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE employee_work_schedule_days (employee_id text, branch_id text, work_date date, day_type text, shift_start time, shift_end time, assignment_label text) ON COMMIT DROP;
        CREATE TEMP TABLE leave_requests (id text, type_id text, status text) ON COMMIT DROP;
        CREATE TEMP TABLE leave_types (id text, code text) ON COMMIT DROP;
        CREATE TEMP TABLE leave_request_days (request_id text, employee_id text, branch_id text, work_date date, units numeric) ON COMMIT DROP;
        INSERT INTO branches VALUES ('branch','Test branch');
        INSERT INTO employees VALUES ('employee','EMP001','Test Employee','branch','ACTIVE'),('outsider','EMP002','Outside Employee','other','ACTIVE');
        INSERT INTO attendance_schedules VALUES ('branch','Asia/Manila',ARRAY[1,2,3,4,5]::smallint[],'08:00','17:00','Office');
        INSERT INTO employee_work_schedule_days VALUES ('employee','branch','2026-10-27','WORK','09:00','18:00','WFH');
        INSERT INTO leave_types VALUES ('vacation','VL'),('sick','SL');
        INSERT INTO leave_requests VALUES ('full','vacation','APPROVED'),('half','sick','APPROVED'),('pending','vacation','PENDING'),('cancelled','vacation','CANCELLED'),('rejected','vacation','REJECTED'),('other-branch','vacation','APPROVED');
        INSERT INTO leave_request_days VALUES
          ('rejected','employee','branch','2026-10-26',1),
          ('full','employee','branch','2026-10-27',1),
          ('half','employee','branch','2026-10-28',0.5),
          ('pending','employee','branch','2026-10-29',1),
          ('cancelled','employee','branch','2026-10-30',1),
          ('other-branch','employee','other','2026-10-31',1);
      `);
      const service = new AttendanceService({ query: runner.manager.query.bind(runner.manager) } as DataSource);
      const roster = await service.getWorkRoster('branch', '2026-10-26');
      expect(roster.employees).toHaveLength(1);
      const days = roster.employees[0].days;
      expect(days).toHaveLength(7);
      expect(days[1]).toMatchObject({ approvedLeave: { units: 1, codes: ['VL'] }, dayType: 'WORK', shiftStart: '09:00', shiftEnd: '18:00', assignmentLabel: 'WFH' });
      expect(days[2]).toMatchObject({ approvedLeave: { units: 0.5, codes: ['SL'] }, shiftStart: '08:00', shiftEnd: '17:00' });
      for (const index of [0, 3, 4, 5, 6]) expect(days[index].approvedLeave).toBeNull();
      const own = await service.getWorkRoster('branch', '2026-10-26', 'employee');
      expect(own.employees[0].days).toEqual(days);
      // Approval is reflected on the next read without writing a roster override.
      await runner.query(`UPDATE leave_requests SET status='APPROVED' WHERE id='pending'`);
      expect((await service.getWorkRoster('branch', '2026-10-26')).employees[0].days[3].approvedLeave).toEqual({ units: 1, codes: ['VL'] });
      await runner.query(`UPDATE leave_requests SET status='CANCELLED' WHERE id='full'`);
      const cancelled = (await service.getWorkRoster('branch', '2026-10-26')).employees[0].days[1];
      expect(cancelled).toMatchObject({ approvedLeave: null, dayType: 'WORK', shiftStart: '09:00', shiftEnd: '18:00', assignmentLabel: 'WFH' });
      const saved = await runner.query('SELECT count(*)::int AS count FROM employee_work_schedule_days');
      expect(saved[0].count).toBe(1);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
      await db.destroy();
    }
  });
});
