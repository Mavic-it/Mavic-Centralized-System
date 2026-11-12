import pg from '../node_modules/pg/lib/index.js';
import { randomUUID } from 'node:crypto';
process.loadEnvFile(new URL('../application/api/.env', import.meta.url));
const client = new pg.Client({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 8000,
});
try {
  await client.connect();
  if (process.argv.includes('--apply')) {
    await client.query('BEGIN');
    try {
      const employeeId = '9f3d6b4e-185a-4f9d-aea1-e7159788a455';
      const accountId = '1d4d2bd5-d9e8-41ad-bd48-c703793feb60';
      const employee = (await client.query('SELECT branch_id FROM employees WHERE id = $1 FOR UPDATE', [employeeId])).rows[0];
      const account = (await client.query('SELECT branch_id, role, employee_id FROM users WHERE id = $1 FOR UPDATE', [accountId])).rows[0];
      if (!employee || account?.employee_id !== employeeId || account.role !== 'EMPLOYEE') throw new Error('Unexpected account or employee; repair cancelled.');
      const branch = (await client.query('SELECT is_active FROM branches WHERE id = $1 FOR SHARE', [employee.branch_id])).rows[0];
      if (!branch?.is_active) throw new Error('Employee branch is inactive; repair cancelled.');
      if (account.branch_id !== employee.branch_id) {
        await client.query('UPDATE users SET branch_id = $2 WHERE id = $1', [accountId, employee.branch_id]);
        await client.query(`INSERT INTO audit_logs (id, user_id, branch_id, action, resource, details, created_at)
          VALUES ($1, $2, $3, 'UPDATE', 'users', $4, now())`, [randomUUID(), accountId, employee.branch_id, JSON.stringify({
          operation: 'repair_employee_account_branch', performedBy: 'system maintenance requested by repository user',
          userIdRepresents: 'affected account, not signed-in actor', employeeId,
          previousBranchId: account.branch_id, branchId: employee.branch_id,
        })]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  const result = await client.query(`
    SELECT u.id AS account_id, u.role, u.employee_id, u.branch_id AS account_branch_id,
      ub.name AS account_branch, e.branch_id AS employee_branch_id, eb.name AS employee_branch
    FROM users u LEFT JOIN employees e ON e.id = u.employee_id
    LEFT JOIN branches ub ON ub.id = u.branch_id LEFT JOIN branches eb ON eb.id = e.branch_id
    WHERE lower(u.name) LIKE $1`, ['%carlyn%']);
  console.log(JSON.stringify(result.rows));
} finally { await client.end(); }
