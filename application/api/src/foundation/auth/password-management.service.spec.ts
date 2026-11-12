import { describe, expect, it, vi } from 'vitest';
import { PasswordManagementService } from './password-management.service.js';

function setup() {
  const db = { query: vi.fn(), transaction: vi.fn() };
  const auth = { canAccess: vi.fn().mockReturnValue(true), hashPassword: vi.fn((value: string) => `hash:${value}`), verifyPassword: vi.fn(async (candidate: string) => ['temporary-password', 'StrongPassword123!'].includes(candidate)), revokeSessionsForUser: vi.fn() };
  const branches = { listAccessibleBranches: vi.fn().mockResolvedValue([{ id: 'branch-1' }]) };
  return { service: new PasswordManagementService(db as never, auth as never, branches as never), db, auth, branches };
}

describe('PasswordManagementService', () => {
  it('returns the same generic response for matching and unknown account identifiers', async () => {
    const { service, db } = setup();
    db.query.mockResolvedValueOnce([{ id: 'user-1', email: 'person@example.test', name: 'Person', role: 'EMPLOYEE', branchId: 'branch-1', status: 'ACTIVE', employeeId: 'employee-1' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const known = await service.request('person@example.test', undefined, 'ip-1');
    const unknown = await service.request('not-registered@example.test', undefined, 'ip-2');
    expect(known).toEqual(unknown);
    expect(known.message).toContain('Request submitted successfully.');
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('creates admin notifications atomically only for new requests, including standalone accounts', async () => {
    const { service, db } = setup();
    db.query.mockResolvedValueOnce([{ id: 'admin-1', name: 'Admin', branchId: null }]).mockResolvedValueOnce([]);
    await service.request('admin@example.test', 'Please help', 'ip-3');
    const [sql, values] = db.query.mock.calls[1];
    expect(sql).toContain('WITH created_request AS');
    expect(sql).toContain("'/system/password-reset-requests?requestId=' || r.id::text");
    expect(sql).toContain('DO NOTHING');
    expect(sql).toContain('FROM created_request r CROSS JOIN users admin');
    expect(sql).toContain("admin.status='ACTIVE' AND admin.role IN ('SUPER_ADMIN','IT_ADMIN')");
    expect(values[2]).toBeNull();
    expect(values[4]).toContain('Admin requested a password reset');
  });

  it('reports database failures so callers can show failed submission feedback', async () => {
    const { service, db } = setup();
    db.query.mockResolvedValueOnce([{ id: 'user-1', name: 'Person', branchId: 'branch-1' }]).mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(service.request('person@example.test', undefined, 'ip-4')).rejects.toThrow('Database unavailable');
  });

  it('returns masked account email and review history in the authorized queue', async () => {
    const { service, db } = setup();
    db.query.mockResolvedValue([{ id: 'request-1', email: 'person@example.test', accountName: 'Person', status: 'PENDING', verifiedByName: null }]);
    const result = await service.list({ userId: 'admin-1', email: 'admin@example.test', role: 'SUPER_ADMIN', branchId: null });
    expect(result[0].email).toBe('p***@example.test');
    expect(String(db.query.mock.calls[0][0])).toContain('LEFT JOIN users verified_user');
  });

  it('stores only a password hash, clears temporary state, audits the change, and revokes sessions', async () => {
    const { service, db, auth } = setup();
    db.query.mockResolvedValue([{ id: 'user-1', email: 'person@example.test', name: 'Person', role: 'SUPER_ADMIN', branchId: null, status: 'ACTIVE', passwordHash: 'old-hash', mustChangePassword: true, temporaryPasswordExpiresAt: null }]);
    db.transaction.mockImplementation(async (work: (manager: { query: typeof vi.fn }) => Promise<unknown>) => work({ query: vi.fn().mockResolvedValue([{ id: 'user-1' }]) }));
    const result = await service.changePassword({ userId: 'user-1', email: 'person@example.test', role: 'SUPER_ADMIN', branchId: null }, { currentPassword: 'temporary-password', newPassword: 'SecurePassword123!', confirmPassword: 'SecurePassword123!' });
    expect(result).toEqual({ ok: true, requireLogin: true });
    expect(auth.hashPassword).toHaveBeenCalledWith('SecurePassword123!');
    expect(auth.revokeSessionsForUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects a weak password before writing', async () => {
    const { service, db } = setup();
    await expect(service.changePassword({ userId: 'user-1', email: 'person@example.test', role: 'EMPLOYEE', branchId: 'branch-1' }, { currentPassword: 'old', newPassword: 'short', confirmPassword: 'short' })).rejects.toThrow('Use at least 12 characters');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('rejects a password-change race instead of overwriting a newly regenerated credential', async () => {
    const { service, db, auth } = setup();
    db.query.mockResolvedValue([{ id: 'user-1', email: 'person@example.test', name: 'Person', status: 'ACTIVE', passwordHash: 'old-hash', temporaryPasswordExpiresAt: null }]);
    const query = vi.fn().mockResolvedValue([]);
    db.transaction.mockImplementation(async (work: (manager: { query: typeof query }) => Promise<unknown>) => work({ query }));
    await expect(service.changePassword({ userId: 'user-1', email: 'person@example.test', role: 'SUPER_ADMIN', branchId: null }, { currentPassword: 'temporary-password', newPassword: 'SecurePassword123!', confirmPassword: 'SecurePassword123!' })).rejects.toThrow('changed or expired');
    expect(auth.revokeSessionsForUser).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledOnce();
  });

  it('rejects reusing the current password', async () => {
    const { service, db } = setup();
    db.query.mockResolvedValue([{ id: 'user-1', email: 'person@example.test', name: 'Person', role: 'EMPLOYEE', branchId: 'branch-1', status: 'ACTIVE', passwordHash: 'old-hash', mustChangePassword: false, temporaryPasswordExpiresAt: null }]);
    await expect(service.changePassword({ userId: 'user-1', email: 'person@example.test', role: 'EMPLOYEE', branchId: 'branch-1' }, { currentPassword: 'StrongPassword123!', newPassword: 'StrongPassword123!', confirmPassword: 'StrongPassword123!' })).rejects.toThrow('Choose a password you have not used before.');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('requires another administrator to approve a requester account', async () => {
    const { service, db } = setup();
    const managerQuery = vi.fn()
      .mockResolvedValueOnce([{ branchId: 'branch-1' }])
      .mockResolvedValueOnce([{ status: 'PENDING', verifiedBy: null, userId: 'admin-1' }]);
    db.transaction.mockImplementation(async (work: (manager: { query: typeof managerQuery }) => Promise<unknown>) => work({ query: managerQuery }));
    await expect(service.approve({ userId: 'admin-1', email: 'admin@example.test', role: 'BRANCH_MANAGER', branchId: 'branch-1' }, 'request-1')).rejects.toThrow('Another authorized administrator');
    expect(managerQuery.mock.calls.some(([sql]) => String(sql).includes("SET status='APPROVED'"))).toBe(false);
  });

  it.each(['PENDING', 'VERIFIED'])('approves %s requests without a verification step', async (status) => {
    const { service, db } = setup();
    const query = vi.fn().mockResolvedValueOnce([{ status, verifiedBy: null, userId: 'employee-1' }]).mockResolvedValue([]);
    db.transaction.mockImplementation(async (work: (manager: { query: typeof query }) => Promise<unknown>) => work({ query }));
    await expect(service.approve({ userId: 'admin-2', email: 'admin@example.test', role: 'SUPER_ADMIN', branchId: null }, 'request-1')).resolves.toEqual({ ok: true, status: 'APPROVED' });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status='APPROVED'"))).toBe(true);
  });

  it.each(['PENDING', 'VERIFIED', 'COMPLETED', 'REJECTED'])('does not issue credentials for a %s request', async (status) => {
    const { service, db } = setup();
    const query = vi.fn().mockResolvedValue([{ status, approvedBy: 'admin-2', userId: 'employee-1' }]);
    db.transaction.mockImplementation(async (work: (manager: { query: typeof query }) => Promise<unknown>) => work({ query }));
    await expect(service.issue({ userId: 'admin-2', email: 'admin@example.test', role: 'SUPER_ADMIN', branchId: null }, 'request-1')).rejects.toThrow('Only approved requests');
    expect(query).toHaveBeenCalledOnce();
  });

  it('sends only the credential email when issuing an approved reset', async () => {
    const { db, auth, branches } = setup();
    const email = {
      sendCredential: vi.fn().mockResolvedValue({ status: 'ACCEPTED_BY_PROVIDER', failure: null }),
      sendSecurityNotice: vi.fn(),
    };
    const service = new PasswordManagementService(db as never, auth as never, branches as never, email as never);
    const query = vi.fn()
      .mockResolvedValueOnce([{ id: 'request-1', status: 'APPROVED', verifiedBy: null, approvedBy: 'approver-1', userId: 'employee-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'employee-1', email: 'employee@example.test', name: 'Employee', status: 'ACTIVE', branchId: 'branch-1' }])
      .mockResolvedValue([]);
    db.transaction.mockImplementation(async (work: (manager: { query: typeof query }) => Promise<unknown>) => work({ query }));
    await expect(service.issue({ userId: 'admin-2', email: 'admin@example.test', role: 'SUPER_ADMIN', branchId: null }, 'request-1')).resolves.toMatchObject({ ok: true });
    expect(email.sendCredential).toHaveBeenCalledOnce();
    expect(email.sendSecurityNotice).not.toHaveBeenCalled();
    expect(auth.revokeSessionsForUser).toHaveBeenCalledWith('employee-1');
  });

  it('does not change the account when the temporary credential email provider is unavailable', async () => {
    const { service, db } = setup();
    const saved = { RESEND_API_KEY: process.env.RESEND_API_KEY, PASSWORD_RESET_FROM_EMAIL: process.env.PASSWORD_RESET_FROM_EMAIL, PUBLIC_APP_URL: process.env.PUBLIC_APP_URL };
    delete process.env.RESEND_API_KEY; delete process.env.PASSWORD_RESET_FROM_EMAIL; delete process.env.PUBLIC_APP_URL;
    const managerQuery = vi.fn()
      .mockResolvedValueOnce([{ id: 'request-1', status: 'APPROVED', verifiedBy: null, approvedBy: 'approver-1', userId: 'employee-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'employee-1', email: 'employee@example.test', name: 'Employee', role: 'EMPLOYEE', branchId: 'branch-1', status: 'ACTIVE', passwordHash: 'old-hash', employeeId: 'employee-record-1' }]);
    db.transaction.mockImplementation(async (work: (manager: { query: typeof managerQuery }) => Promise<unknown>) => work({ query: managerQuery }));
    try {
      await expect(service.issue({ userId: 'admin-2', email: 'admin@example.test', role: 'SUPER_ADMIN', branchId: null }, 'request-1')).rejects.toThrow('Email could not be accepted');
      expect(managerQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE users SET password_hash'))).toBe(false);
      expect(managerQuery.mock.calls.some(([sql]) => String(sql).includes("email_dispatch_status='FAILED'"))).toBe(true);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
