import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import type { UpdateOwnUserProfileDto } from './user-profile.dto.js';
import { UserProfileService } from './user-profile.service.js';

const profileInput = {
  firstName: 'Alex',
  middleName: 'M',
  lastName: 'Admin',
  displayName: 'Alex Admin',
  dateOfBirth: '1980-04-12',
  gender: 'Prefer not to say',
  contactNumber: '+63 917 000 0000',
  homeAddress: 'Makati City',
  emergencyContactName: 'Taylor Admin',
  emergencyContactRelationship: 'Sibling',
  emergencyContactNumber: '+63 917 000 0001',
} satisfies UpdateOwnUserProfileDto;

describe('UserProfileService', () => {
  it('returns only the authenticated Super Admin account profile', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        userId: 'user-1',
        email: 'admin@example.test',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        employeeId: null,
        accountCreatedAt: null,
        lastLoginAt: '2026-10-13T09:30:00.000Z',
        profileUserId: null,
      },
    ]);
    const service = new UserProfileService({ query } as unknown as DataSource);

    await expect(service.getOwnProfile('user-1')).resolves.toEqual({
      mode: 'independent',
      account: {
        email: 'admin@example.test',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        createdAt: null,
        lastLoginAt: '2026-10-13T09:30:00.000Z',
      },
      profile: null,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE u.id = $1'), [
      'user-1',
    ]);
  });

  it('routes explicitly linked Super Admin accounts to their employee profile', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        userId: 'user-1',
        email: 'admin@example.test',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        employeeId: 'employee-1',
        accountCreatedAt: null,
        profileUserId: null,
      },
    ]);
    const service = new UserProfileService({ query } as unknown as DataSource);

    await expect(service.getOwnProfile('user-1')).resolves.toEqual({
      mode: 'employee',
      employeeId: 'employee-1',
    });
  });

  it('rejects inactive or non-Super-Admin accounts', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        userId: 'user-1',
        email: 'employee@example.test',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        employeeId: 'employee-1',
        accountCreatedAt: null,
        profileUserId: null,
      },
    ]);
    const service = new UserProfileService({ query } as unknown as DataSource);

    await expect(service.getOwnProfile('user-1')).rejects.toThrow(
      'Independent profiles are available only to active Super Admin accounts.',
    );
  });

  it('creates an independent profile and audits changed field names only', async () => {
    const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      calls.push({ sql, parameters });
      if (sql.includes('FROM users')) {
        return [
          {
            userId: 'session-user',
            email: 'admin@example.test',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            employeeId: null,
            accountCreatedAt: null,
          },
        ];
      }
      if (sql.includes('FROM user_profiles')) return [];
      if (sql.includes('INSERT INTO user_profiles')) {
        return [
          {
            userId: 'session-user',
            ...profileInput,
            profilePictureUpdatedAt: null,
            createdAt: '2026-10-13T00:00:00.000Z',
            updatedAt: '2026-10-13T00:00:00.000Z',
          },
        ];
      }
      return [];
    });
    const manager = { query } as unknown as EntityManager;
    const dataSource = {
      query: vi.fn(),
      transaction: async (work: (value: EntityManager) => unknown) =>
        work(manager),
    } as unknown as DataSource;
    const service = new UserProfileService(dataSource);

    await expect(
      service.updateOwnProfile('session-user', profileInput),
    ).resolves.toMatchObject({
      mode: 'independent',
      account: { email: 'admin@example.test', role: 'SUPER_ADMIN' },
      profile: { firstName: 'Alex', displayName: 'Alex Admin' },
    });

    const insert = calls.find(({ sql }) => sql.includes('INSERT INTO user_profiles'));
    const audit = calls.find(({ sql }) => sql.includes('INSERT INTO audit_logs'));
    expect(insert?.parameters?.[0]).toBe('session-user');
    expect(calls.some(({ sql }) => sql.includes('INSERT INTO employees'))).toBe(
      false,
    );
    expect(audit?.parameters?.[1]).toBe('session-user');
    const details = JSON.parse(String(audit?.parameters?.[4])) as {
      changedFields: string[];
      homeAddress?: string;
    };
    expect(details.changedFields).toContain('homeAddress');
    expect(details).not.toHaveProperty('homeAddress');
  });

  it('blocks profile writes for linked Super Admins before touching profile data', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM users')) {
        return [
          {
            userId: 'linked-user',
            email: 'admin@example.test',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            employeeId: 'employee-1',
            accountCreatedAt: null,
          },
        ];
      }
      return [];
    });
    const manager = { query } as unknown as EntityManager;
    const dataSource = {
      transaction: async (work: (value: EntityManager) => unknown) =>
        work(manager),
    } as unknown as DataSource;
    const service = new UserProfileService(dataSource);

    await expect(
      service.updateOwnProfile('linked-user', profileInput),
    ).rejects.toThrow('Linked employee accounts must use their employee profile.');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('requires emergency contact fields as an all-or-none group', async () => {
    const transaction = vi.fn();
    const service = new UserProfileService({ transaction } as unknown as DataSource);

    await expect(
      service.updateOwnProfile('user-1', {
        ...profileInput,
        emergencyContactNumber: null,
      }),
    ).rejects.toThrow('Complete all emergency contact fields or leave them blank.');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a future birthdate before opening a transaction', async () => {
    const transaction = vi.fn();
    const service = new UserProfileService({ transaction } as unknown as DataSource);

    await expect(
      service.updateOwnProfile('user-1', {
        ...profileInput,
        dateOfBirth: '2999-01-01',
      }),
    ).rejects.toThrow('Enter a valid birthdate in the past.');
    expect(transaction).not.toHaveBeenCalled();
  });
});
