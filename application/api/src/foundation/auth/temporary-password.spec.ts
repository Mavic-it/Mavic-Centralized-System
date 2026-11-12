import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword } from './temporary-password.js';
import { AuthService } from './auth.service.js';
import { UserService } from '../users/user.service.js';

describe('Automatic temporary passwords and first login', () => {
  it('generates distinct strong credentials with every required character class', () => {
    const passwords = Array.from({ length: 100 }, () =>
      generateTemporaryPassword(),
    );
    expect(new Set(passwords).size).toBe(100);
    for (const password of passwords) {
      expect(password).toHaveLength(12);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
    }
  });
  it.each([8, 9, 10, 11, 12])('supports %i-character temporary passwords', (length) => {
    const password = generateTemporaryPassword(length);
    expect(password).toHaveLength(length);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
  });
  it.each([7, 13, 8.5, NaN])('rejects invalid length %s', (length) => {
    expect(() => generateTemporaryPassword(length)).toThrow();
  });
  it('uses the existing secure hash without storing a plaintext password', async () => {
    const auth = new AuthService();
    const password = generateTemporaryPassword();
    const hash = auth.hashPassword(password);
    expect(hash).not.toContain(password);
    await expect(auth.verifyPassword(password, hash)).resolves.toBe(true);
    await expect(auth.verifyPassword('wrong', hash)).resolves.toBe(false);
  });
  it.each(['PENDING', 'PROCESSING', 'FAILED'] as const)(
    'blocks login for a %s credential email',
    async (status) => {
      const users = new UserService();
      const auth = new AuthService(users);
      users.create({
        id: 'new-1',
        email: 'person@example.test',
        name: 'Person',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        passwordHash: auth.hashPassword('TemporaryPass123!'),
        mustChangePassword: true,
        credentialEmailStatus: status,
        temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
      });
      await expect(
        auth.login({
          email: 'person@example.test',
          password: 'TemporaryPass123!',
        }),
      ).rejects.toThrow('Invalid email or password');
    },
  );
  it('allows an accepted credential while retaining the required password change', async () => {
    const users = new UserService();
    const auth = new AuthService(users);
    users.create({
      id: 'new-1',
      email: 'person@example.test',
      name: 'Person',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      passwordHash: auth.hashPassword('TemporaryPass123!'),
      mustChangePassword: true,
      credentialEmailStatus: 'ACCEPTED_BY_PROVIDER',
      temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      auth.login({
        email: 'person@example.test',
        password: 'TemporaryPass123!',
      }),
    ).resolves.toBeTypeOf('string');
    await expect(auth.getPasswordSecurityState('new-1')).resolves.toEqual({
      mustChangePassword: true,
    });
  });
  it('rejects expired credentials even after SMTP acceptance', async () => {
    const users = new UserService();
    const auth = new AuthService(users);
    users.create({
      id: 'new-1',
      email: 'person@example.test',
      name: 'Person',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      passwordHash: auth.hashPassword('TemporaryPass123!'),
      mustChangePassword: true,
      credentialEmailStatus: 'ACCEPTED_BY_PROVIDER',
      temporaryPasswordExpiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      auth.login({
        email: 'person@example.test',
        password: 'TemporaryPass123!',
      }),
    ).rejects.toThrow('Invalid email or password');
  });
});
