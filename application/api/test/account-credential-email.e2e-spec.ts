import { existsSync } from 'node:fs';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AccountCredentialEmail1792540802000 } from '../src/database/migrations/1792540802000-AccountCredentialEmail.js';
import { UserService } from '../src/foundation/users/user.service.js';
import { AccountProvisioningService } from '../src/foundation/users/account-provisioning.service.js';
import { AuthService } from '../src/foundation/auth/auth.service.js';
import { PasswordManagementService } from '../src/foundation/auth/password-management.service.js';
import type { EmailDelivery } from '../src/email/email.service.js';
import type { CredentialEmail } from '../src/email/credential-email.template.js';

describe.skipIf(process.env.RUN_DATABASE_MIGRATION_TESTS !== 'true')(
  'Credential emails on PostgreSQL (temporary tables only)',
  () => {
    let db: DataSource;
    let runner: QueryRunner;
    const migration = new AccountCredentialEmail1792540802000();
    beforeAll(async () => {
      if (existsSync('.env')) process.loadEnvFile('.env');
      db = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME ?? 'mspaces_app',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_DATABASE ?? 'mspaces_db',
        ssl:
          process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        synchronize: false,
        migrationsRun: false,
        connectTimeoutMS: 5000,
      });
      await db.initialize();
    });
    beforeEach(async () => {
      runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      await runner.query(
        `CREATE TEMP TABLE users (id varchar(100) PRIMARY KEY,email text UNIQUE,name text,password_hash text,role text,branch_id text,employee_id text,status text,must_change_password boolean NOT NULL DEFAULT false,temporary_password_expires_at timestamptz,password_changed_at timestamptz,last_login_at timestamptz) ON COMMIT DROP`,
      );
      await runner.query(
        'CREATE TEMP TABLE audit_logs (id text,user_id text,branch_id text,action text,resource text,details jsonb,created_at timestamptz) ON COMMIT DROP',
      );
      await runner.query('SET LOCAL search_path TO pg_temp');
      await migration.up(runner);
    });
    afterEach(async () => {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
      if (runner && !runner.isReleased) await runner.release();
    });
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });

    function services() {
      const connection = {
        query: runner.query.bind(runner),
        transaction: async <T>(
          work: (manager: typeof runner.manager) => Promise<T>,
        ) => work(runner.manager),
      } as unknown as DataSource;
      const users = new UserService(connection);
      const auth = new AuthService(users);
      const email = {
        temporaryPasswordHours: 24,
        sendCredential: vi
          .fn<(input: CredentialEmail) => Promise<EmailDelivery>>()
          .mockResolvedValue({ status: 'ACCEPTED_BY_PROVIDER', failure: null }),
      };
      return {
        users,
        auth,
        email,
        passwords: new PasswordManagementService(connection, auth, {} as never),
        provisioning: new AccountProvisioningService(
          connection,
          users,
          auth,
          email as never,
        ),
      };
    }
    const actor = {
      userId: 'admin-test',
      role: 'SUPER_ADMIN' as const,
      email: 'admin@example.test',
      branchId: null,
    };

    it('migrates repeatedly without changing legacy credentials or security defaults', async () => {
      await runner.query(
        "INSERT INTO users(id,email,password_hash) VALUES('legacy','legacy@example.test','legacy-hash')",
      );
      await migration.up(runner);
      const [row] = await runner.query(
        "SELECT password_hash,credential_email_status FROM users WHERE id='legacy'",
      );
      expect(row).toEqual({
        password_hash: 'legacy-hash',
        credential_email_status: 'NOT_REQUIRED',
      });
    });
    it('creates, persists acceptance and hashes the emailed password without returning it', async () => {
      const { provisioning, auth, email, users } = services();
      const result = await provisioning.create(
        { name: 'New Admin', email: 'new@example.test', role: 'SUPER_ADMIN' },
        actor,
      );
      const sent = email.sendCredential.mock.calls[0][0];
      const stored = await users.findByEmail('new@example.test');
      expect(stored?.mustChangePassword).toBe(true);
      expect(stored?.credentialEmailStatus).toBe('ACCEPTED_BY_PROVIDER');
      expect(stored?.temporaryPasswordExpiresAt).toBeInstanceOf(Date);
      await expect(
        auth.verifyPassword(sent.password, stored!.passwordHash!),
      ).resolves.toBe(true);
      expect(JSON.stringify(result)).not.toContain(sent.password);
      const audits = await runner.query('SELECT details FROM audit_logs');
      expect(JSON.stringify(audits)).not.toContain(sent.password);
      expect(result.emailDelivery).toBe('ACCEPTED_BY_PROVIDER');
    });
    it('persists failure and regenerates a new credential, invalidating the previous hash', async () => {
      const { provisioning, email, users, auth } = services();
      email.sendCredential.mockResolvedValueOnce({
        status: 'FAILED',
        failure: 'SMTP_UNAVAILABLE',
      });
      const result = await provisioning.create(
        { name: 'New Admin', email: 'retry@example.test', role: 'SUPER_ADMIN' },
        actor,
      );
      expect(result.emailDelivery).toBe('FAILED');
      const oldPassword = email.sendCredential.mock.calls[0][0].password;
      await runner.query(
        "UPDATE users SET credential_email_started_at=now()-interval '1 minute' WHERE id=$1",
        [result.data.id],
      );
      await provisioning.regenerate(result.data.id, actor);
      const stored = await users.findByEmail('retry@example.test');
      await expect(
        auth.verifyPassword(oldPassword, stored!.passwordHash!),
      ).resolves.toBe(false);
      await expect(
        auth.verifyPassword(
          email.sendCredential.mock.calls[1][0].password,
          stored!.passwordHash!,
        ),
      ).resolves.toBe(true);
      expect(stored?.credentialEmailStatus).toBe('ACCEPTED_BY_PROVIDER');
    });
    it('prevents case-insensitive duplicate accounts at the database boundary', async () => {
      const { provisioning, email } = services();
      await provisioning.create(
        { name: 'First', email: 'case@example.test', role: 'SUPER_ADMIN' },
        actor,
      );
      await expect(
        provisioning.create(
          { name: 'Second', email: 'CASE@example.test', role: 'SUPER_ADMIN' },
          actor,
        ),
      ).rejects.toThrow('already exists');
      expect(email.sendCredential).toHaveBeenCalledOnce();
    });
    it('changes a temporary password, clears expiry and revokes its session', async () => {
      const { provisioning, users, auth, email, passwords } = services();
      const result = await provisioning.create(
        {
          name: 'New Admin',
          email: 'change@example.test',
          role: 'SUPER_ADMIN',
        },
        actor,
      );
      const temporary = email.sendCredential.mock.calls[0][0].password;
      const token = await auth.login({
        email: 'change@example.test',
        password: temporary,
      });
      expect(auth.validateSession(token).valid).toBe(true);
      await passwords.changePassword(
        { ...actor, userId: result.data.id, email: 'change@example.test' },
        {
          currentPassword: temporary,
          newPassword: 'ChangedStrongPass123!',
          confirmPassword: 'ChangedStrongPass123!',
        },
      );
      expect(auth.validateSession(token).valid).toBe(false);
      const stored = await users.findByEmail('change@example.test');
      expect(stored?.mustChangePassword).toBe(false);
      expect(stored?.temporaryPasswordExpiresAt).toBeNull();
      await expect(
        auth.verifyPassword(temporary, stored!.passwordHash!),
      ).resolves.toBe(false);
      await expect(
        auth.verifyPassword('ChangedStrongPass123!', stored!.passwordHash!),
      ).resolves.toBe(true);
      await expect(
        provisioning.regenerate(result.data.id, actor),
      ).rejects.toThrow('initial password change');
    });
    it('does not activate a credential if its registered email changes during sending', async () => {
      const { provisioning, email, users } = services();
      email.sendCredential.mockImplementationOnce(async (input) => {
        await runner.query('UPDATE users SET email=$2 WHERE email=$1', [
          input.email,
          'changed@example.test',
        ]);
        const [changed] = await runner.query(
          'SELECT email FROM users WHERE email=$1',
          ['changed@example.test'],
        );
        expect(changed?.email).toBe('changed@example.test');
        return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
      });
      await expect(
        provisioning.create(
          {
            name: 'New Admin',
            email: 'original@example.test',
            role: 'SUPER_ADMIN',
          },
          actor,
        ),
      ).rejects.toThrow('attempt changed');
      expect(
        (await users.findByEmail('changed@example.test'))
          ?.credentialEmailStatus,
      ).toBe('PROCESSING');
    });
    it('does not overwrite a concurrent regeneration during password verification', async () => {
      const { provisioning, users, email, auth, passwords } = services();
      const result = await provisioning.create(
        { name: 'New Admin', email: 'race@example.test', role: 'SUPER_ADMIN' },
        actor,
      );
      const temporary = email.sendCredential.mock.calls[0][0].password;
      const verify = auth.verifyPassword.bind(auth);
      const regeneratedHash = auth.hashPassword('RegeneratedStrongPass123!');
      vi.spyOn(auth, 'verifyPassword').mockImplementation(
        async (candidate, hash) => {
          const matched = await verify(candidate, hash);
          if (matched && candidate === temporary)
            await runner.query(
              'UPDATE users SET password_hash=$2 WHERE id=$1',
              [result.data.id, regeneratedHash],
            );
          return matched;
        },
      );
      await expect(
        passwords.changePassword(
          { ...actor, userId: result.data.id, email: 'race@example.test' },
          {
            currentPassword: temporary,
            newPassword: 'ChangedStrongPass123!',
            confirmPassword: 'ChangedStrongPass123!',
          },
        ),
      ).rejects.toThrow('changed or expired');
      const stored = await users.findByEmail('race@example.test');
      expect(stored?.passwordHash).toBe(regeneratedHash);
      expect(stored?.mustChangePassword).toBe(true);
      const audit = await runner.query(
        "SELECT id FROM audit_logs WHERE action='PASSWORD_CHANGED'",
      );
      expect(audit).toHaveLength(0);
    });
  },
);
