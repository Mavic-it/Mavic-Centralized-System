import { describe, expect, it, vi } from 'vitest';
import { AccountProvisioningService } from './account-provisioning.service.js';
import type { AuthUserContext } from '../auth/auth.context.js';
import type { EmailDelivery } from '../../email/email.service.js';

const actor: AuthUserContext = {
  userId: 'admin-1',
  email: 'admin@example.test',
  role: 'SUPER_ADMIN',
  branchId: null,
};
function setup() {
  const row = {
    id: 'user-1',
    name: 'Person',
    email: 'person@example.test',
    role: 'EMPLOYEE',
    branchId: 'branch-1',
    employeeId: 'employee-1',
    status: 'ACTIVE',
    mustChangePassword: true,
    credentialEmailStatus: 'PENDING',
    startedAt: null as Date | null,
    attemptId: '',
    hash: '',
  };
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('FROM users WHERE id=$1 FOR UPDATE')) return [{ ...row }];
    if (sql.includes('SET password_hash')) {
      row.hash = String(values[1]);
      row.attemptId = String(values[3]);
      row.credentialEmailStatus = 'PROCESSING';
      row.startedAt = new Date();
    }
    if (sql.includes('SET credential_email_status=$3')) {
      if (
        row.attemptId !== values[1] ||
        row.credentialEmailStatus !== 'PROCESSING'
      )
        return [];
      row.credentialEmailStatus = String(values[2]);
      return [{ id: row.id }];
    }
    return [];
  });
  const db = {
    transaction: vi.fn(
      async (work: (manager: { query: typeof query }) => Promise<unknown>) =>
        work({ query }),
    ),
  };
  const users = { createAccount: vi.fn().mockResolvedValue({ ...row }) };
  const auth = {
    canAccess: vi.fn().mockReturnValue(true),
    hashPassword: vi.fn().mockReturnValue('one-way-hash'),
    revokeSessionsForUser: vi.fn(),
  };
  const email = {
    temporaryPasswordHours: 24,
    sendCredential: vi
      .fn<() => Promise<EmailDelivery>>()
      .mockResolvedValue({ status: 'ACCEPTED_BY_PROVIDER', failure: null }),
  };
  return {
    service: new AccountProvisioningService(
      db as never,
      users as never,
      auth as never,
      email as never,
    ),
    row,
    db,
    users,
    auth,
    email,
    query,
  };
}

describe('Account provisioning credential delivery', () => {
  it('creates with a hash and first-login expiry and sends only to the stored email', async () => {
    const { service, users, email, query, auth } = setup();
    const result = await service.create(
      {
        name: 'Person',
        email: 'person@example.test',
        role: 'EMPLOYEE',
        employeeId: 'employee-1',
      },
      actor,
    );
    expect(users.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: 'one-way-hash',
        temporaryPasswordExpiresAt: expect.any(Date),
        actorId: actor.userId,
      }),
    );
    const sent = email.sendCredential.mock.calls[0] as unknown as [
      { password: string; email: string },
    ];
    expect(sent[0].email).toBe('person@example.test');
    expect(JSON.stringify(result)).not.toContain(sent[0].password);
    expect(JSON.stringify(result)).not.toContain('one-way-hash');
    expect(result.emailDelivery).toBe('ACCEPTED_BY_PROVIDER');
    expect(result.data.mustChangePassword).toBe(true);
    expect(
      query.mock.calls.some(([, values]) => values?.includes(sent[0].password)),
    ).toBe(false);
    expect(auth.revokeSessionsForUser).toHaveBeenCalledWith('user-1');
  });
  it('preserves failed delivery and supports secure regeneration without recreating the account', async () => {
    const { service, row, email, users } = setup();
    email.sendCredential.mockResolvedValueOnce({
      status: 'FAILED',
      failure: 'SMTP_UNAVAILABLE',
    });
    const first = await service.regenerate(row.id, actor);
    expect(first.emailDelivery).toBe('FAILED');
    expect(row.credentialEmailStatus).toBe('FAILED');
    row.startedAt = new Date(Date.now() - 60_000);
    await expect(service.regenerate(row.id, actor)).resolves.toMatchObject({
      emailDelivery: 'ACCEPTED_BY_PROVIDER',
    });
    expect(users.createAccount).not.toHaveBeenCalled();
    const calls = email.sendCredential.mock.calls as unknown as Array<
      [{ password: string }]
    >;
    expect(calls[0][0].password).not.toBe(calls[1][0].password);
  });
  it('does not send when account creation fails as a duplicate', async () => {
    const { service, users, email } = setup();
    users.createAccount.mockRejectedValue(
      new Error('An account already exists for this employee or email.'),
    );
    await expect(
      service.create(
        { name: 'Person', email: 'person@example.test', role: 'SUPER_ADMIN' },
        actor,
      ),
    ).rejects.toThrow('already exists');
    expect(email.sendCredential).not.toHaveBeenCalled();
  });
  it.each(['HR_ADMIN', 'BRANCH_MANAGER', 'EMPLOYEE'] as const)(
    'rejects %s before touching persistence',
    async (role) => {
      const { service, db } = setup();
      await expect(
        service.regenerate('user-1', { ...actor, role }),
      ).rejects.toThrow('not permitted');
      expect(db.transaction).not.toHaveBeenCalled();
    },
  );
  it('does not permit IT to manage Super Admin credentials', async () => {
    const { service, row, email } = setup();
    row.role = 'SUPER_ADMIN';
    await expect(
      service.regenerate(row.id, { ...actor, role: 'IT_ADMIN' }),
    ).rejects.toThrow('Only a Super Admin');
    expect(email.sendCredential).not.toHaveBeenCalled();
  });
  it('rejects self-regeneration and established accounts', async () => {
    const { service, row, email } = setup();
    await expect(
      service.regenerate(row.id, { ...actor, userId: row.id }),
    ).rejects.toThrow('Another authorized administrator');
    row.mustChangePassword = false;
    await expect(service.regenerate(row.id, actor)).rejects.toThrow(
      'initial password change',
    );
    expect(email.sendCredential).not.toHaveBeenCalled();
  });
  it('blocks concurrent or repeated delivery while an attempt is running', async () => {
    const { service, row, email } = setup();
    row.credentialEmailStatus = 'PROCESSING';
    row.startedAt = new Date();
    await expect(service.regenerate(row.id, actor)).rejects.toThrow(
      'already being processed',
    );
    expect(email.sendCredential).not.toHaveBeenCalled();
  });
  it('regenerates a stale attempt without replaying an earlier plaintext credential', async () => {
    const { service, row } = setup();
    row.credentialEmailStatus = 'PROCESSING';
    row.startedAt = new Date(Date.now() - 180_000);
    await expect(service.regenerate(row.id, actor)).resolves.toMatchObject({
      emailDelivery: 'ACCEPTED_BY_PROVIDER',
    });
  });
  it('does not let a stale SMTP result finalize a newer attempt', async () => {
    const { service, row, email } = setup();
    email.sendCredential.mockImplementation(async () => {
      row.attemptId = 'newer-attempt';
      return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
    });
    await expect(service.regenerate(row.id, actor)).rejects.toThrow(
      'attempt changed',
    );
    expect(row.credentialEmailStatus).toBe('PROCESSING');
  });
  it('allows only one sender while a concurrent delivery is in flight', async () => {
    const { service, row, email } = setup();
    let finish = () => {};
    const sending = new Promise<EmailDelivery>((resolve) => {
      finish = () => resolve({ status: 'ACCEPTED_BY_PROVIDER', failure: null });
    });
    let arrived = () => {};
    const started = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    email.sendCredential.mockImplementation(async () => {
      arrived();
      return sending;
    });
    const first = service.regenerate(row.id, actor);
    await started;
    await expect(service.regenerate(row.id, actor)).rejects.toThrow(
      'already being processed',
    );
    finish();
    await first;
    expect(email.sendCredential).toHaveBeenCalledOnce();
  });
  it('enforces permissions even when an administrator role is supplied', async () => {
    const { service, auth, db } = setup();
    auth.canAccess.mockReturnValue(false);
    await expect(service.regenerate('user-1', actor)).rejects.toThrow(
      'not permitted',
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
