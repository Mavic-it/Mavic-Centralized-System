import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type { UpdateOwnUserProfileDto } from './user-profile.dto.js';

type AccountRow = {
  userId: string;
  email: string;
  role: string;
  status: string;
  employeeId: string | null;
  accountCreatedAt: Date | string | null;
  lastLoginAt: Date | string | null;
};

type ProfileRow = {
  userId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  displayName: string;
  dateOfBirth: Date | string | null;
  gender: string | null;
  contactNumber: string;
  homeAddress: string;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactNumber: string | null;
  profilePictureUpdatedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ExistingProfileRow = Omit<ProfileRow, 'createdAt' | 'updatedAt'>;

type UserProfileAuditContext = {
  ip?: string;
  userAgent?: string;
};

export type OwnProfileResponse =
  | { mode: 'employee'; employeeId: string }
  | {
      mode: 'independent';
      account: {
        email: string;
        role: 'SUPER_ADMIN';
        status: string;
        createdAt: string | null;
        lastLoginAt: string | null;
      };
      profile: (Omit<ProfileRow, 'userId' | 'createdAt' | 'updatedAt'> & {
        createdAt: string;
        updatedAt: string;
      }) | null;
    };

export type UserProfilePicture = {
  mimeType: string;
  data: Buffer;
};

const profileFields = [
  'firstName',
  'middleName',
  'lastName',
  'displayName',
  'dateOfBirth',
  'gender',
  'contactNumber',
  'homeAddress',
  'emergencyContactName',
  'emergencyContactRelationship',
  'emergencyContactNumber',
] as const;

type ProfileField = (typeof profileFields)[number];

function dateOnly(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function dateTime(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeProfile(
  input: UpdateOwnUserProfileDto,
): Record<ProfileField, string | null> {
  const normalized: Record<ProfileField, string | null> = {
    firstName: input.firstName.trim(),
    middleName: input.middleName?.trim() || null,
    lastName: input.lastName.trim(),
    displayName: input.displayName.trim(),
    dateOfBirth: input.dateOfBirth?.trim() || null,
    gender: input.gender?.trim() || null,
    contactNumber: input.contactNumber.trim(),
    homeAddress: input.homeAddress.trim(),
    emergencyContactName: input.emergencyContactName?.trim() || null,
    emergencyContactRelationship:
      input.emergencyContactRelationship?.trim() || null,
    emergencyContactNumber: input.emergencyContactNumber?.trim() || null,
  };

  const emergencyValues = [
    normalized.emergencyContactName,
    normalized.emergencyContactRelationship,
    normalized.emergencyContactNumber,
  ];
  if (emergencyValues.some(Boolean) && emergencyValues.some((value) => !value)) {
    throw new BadRequestException(
      'Complete all emergency contact fields or leave them blank.',
    );
  }

  if (normalized.dateOfBirth) {
    const parsed = new Date(`${normalized.dateOfBirth}T00:00:00.000Z`);
    const today = new Date().toISOString().slice(0, 10);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== normalized.dateOfBirth ||
      normalized.dateOfBirth > today
    ) {
      throw new BadRequestException('Enter a valid birthdate in the past.');
    }
  }

  return normalized;
}

function mappedProfile(row: ProfileRow) {
  return {
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    displayName: row.displayName,
    dateOfBirth: dateOnly(row.dateOfBirth),
    gender: row.gender,
    contactNumber: row.contactNumber,
    homeAddress: row.homeAddress,
    emergencyContactName: row.emergencyContactName,
    emergencyContactRelationship: row.emergencyContactRelationship,
    emergencyContactNumber: row.emergencyContactNumber,
    profilePictureUpdatedAt: dateTime(row.profilePictureUpdatedAt),
    createdAt: dateTime(row.createdAt)!,
    updatedAt: dateTime(row.updatedAt)!,
  };
}

export class UserProfileService {
  constructor(private readonly dataSource: DataSource) {}

  async getOwnProfile(userId: string): Promise<OwnProfileResponse> {
    const rows = await this.dataSource.query<
      Array<
        AccountRow &
          Partial<ProfileRow> & { profileUserId: string | null }
      >
    >(
      `SELECT u.id AS "userId", u.email, u.role, u.status,
              u.employee_id AS "employeeId", u.created_at AS "accountCreatedAt",
              u.last_login_at AS "lastLoginAt",
              p.user_id AS "profileUserId", p.first_name AS "firstName",
              p.middle_name AS "middleName", p.last_name AS "lastName",
              p.display_name AS "displayName", p.date_of_birth AS "dateOfBirth",
              p.gender, p.contact_number AS "contactNumber",
              p.home_address AS "homeAddress",
              p.emergency_contact_name AS "emergencyContactName",
              p.emergency_contact_relationship AS "emergencyContactRelationship",
              p.emergency_contact_number AS "emergencyContactNumber",
              p.profile_picture_updated_at AS "profilePictureUpdatedAt",
              p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('User account not found.');
    this.requireActiveSuperAdmin(row);

    if (row.employeeId) {
      return { mode: 'employee', employeeId: row.employeeId };
    }

    return {
      mode: 'independent',
      account: {
        email: row.email,
        role: 'SUPER_ADMIN',
        status: row.status,
        createdAt: dateTime(row.accountCreatedAt),
        lastLoginAt: dateTime(row.lastLoginAt),
      },
      profile: row.profileUserId
        ? mappedProfile(row as ProfileRow)
        : null,
    };
  }

  async updateOwnProfile(
    userId: string,
    input: UpdateOwnUserProfileDto,
    context: UserProfileAuditContext = {},
  ): Promise<OwnProfileResponse> {
    const normalized = normalizeProfile(input);
    return this.dataSource.transaction(async (manager) => {
      const account = await this.requireIndependentSuperAdmin(manager, userId);
      const existingRows = await manager.query<ExistingProfileRow[]>(
        `SELECT user_id AS "userId", first_name AS "firstName",
                middle_name AS "middleName", last_name AS "lastName",
                display_name AS "displayName", date_of_birth AS "dateOfBirth",
                gender, contact_number AS "contactNumber",
                home_address AS "homeAddress",
                emergency_contact_name AS "emergencyContactName",
                emergency_contact_relationship AS "emergencyContactRelationship",
                emergency_contact_number AS "emergencyContactNumber",
                profile_picture_updated_at AS "profilePictureUpdatedAt"
         FROM user_profiles
         WHERE user_id = $1
         FOR UPDATE`,
        [userId],
      );
      const existing = existingRows[0];
      const changedFields = existing
        ? profileFields.filter((field) => {
            const prior =
              field === 'dateOfBirth'
                ? dateOnly(existing[field] as Date | string | null)
                : existing[field];
            return prior !== normalized[field];
          })
        : [...profileFields];

      const rows = await manager.query<ProfileRow[]>(
        `INSERT INTO user_profiles
           (user_id, first_name, middle_name, last_name, display_name,
            date_of_birth, gender, contact_number, home_address,
            emergency_contact_name, emergency_contact_relationship,
            emergency_contact_number, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
         ON CONFLICT (user_id) DO UPDATE SET
           first_name = EXCLUDED.first_name,
           middle_name = EXCLUDED.middle_name,
           last_name = EXCLUDED.last_name,
           display_name = EXCLUDED.display_name,
           date_of_birth = EXCLUDED.date_of_birth,
           gender = EXCLUDED.gender,
           contact_number = EXCLUDED.contact_number,
           home_address = EXCLUDED.home_address,
           emergency_contact_name = EXCLUDED.emergency_contact_name,
           emergency_contact_relationship = EXCLUDED.emergency_contact_relationship,
           emergency_contact_number = EXCLUDED.emergency_contact_number,
           updated_at = now()
         RETURNING user_id AS "userId", first_name AS "firstName",
                   middle_name AS "middleName", last_name AS "lastName",
                   display_name AS "displayName", date_of_birth AS "dateOfBirth",
                   gender, contact_number AS "contactNumber",
                   home_address AS "homeAddress",
                   emergency_contact_name AS "emergencyContactName",
                   emergency_contact_relationship AS "emergencyContactRelationship",
                   emergency_contact_number AS "emergencyContactNumber",
                   profile_picture_updated_at AS "profilePictureUpdatedAt",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          userId,
          normalized.firstName,
          normalized.middleName,
          normalized.lastName,
          normalized.displayName,
          normalized.dateOfBirth,
          normalized.gender,
          normalized.contactNumber,
          normalized.homeAddress,
          normalized.emergencyContactName,
          normalized.emergencyContactRelationship,
          normalized.emergencyContactNumber,
        ],
      );
      const saved = rows[0];
      if (!saved) throw new Error('The profile update did not return a row.');

      if (!existing || changedFields.length > 0) {
        await this.writeAudit(
          manager,
          userId,
          existing ? 'USER_PROFILE_UPDATED' : 'USER_PROFILE_CREATED',
          existing ? changedFields : [...profileFields],
          context,
        );
      }

      return {
        mode: 'independent',
        account: {
          email: account.email,
          role: 'SUPER_ADMIN',
          status: account.status,
          createdAt: dateTime(account.accountCreatedAt),
          lastLoginAt: dateTime(account.lastLoginAt),
        },
        profile: mappedProfile(saved),
      };
    });
  }

  async getProfilePicture(
    userId: string,
  ): Promise<UserProfilePicture | undefined> {
    const accountRows = await this.dataSource.query<AccountRow[]>(
      `SELECT id AS "userId", email, role, status,
              employee_id AS "employeeId", created_at AS "accountCreatedAt",
              last_login_at AS "lastLoginAt"
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const account = accountRows[0];
    if (!account) throw new NotFoundException('User account not found.');
    this.requireActiveSuperAdmin(account);
    if (account.employeeId) {
      throw new ForbiddenException(
        'Linked employee accounts use their employee profile picture.',
      );
    }

    const rows = await this.dataSource.query<
      Array<{ mimeType: string; data: Buffer | Uint8Array }>
    >(
      `SELECT profile_picture_mime_type AS "mimeType",
              profile_picture_data AS data
       FROM user_profiles
       WHERE user_id = $1 AND profile_picture_data IS NOT NULL`,
      [userId],
    );
    const picture = rows[0];
    return picture
      ? { mimeType: picture.mimeType, data: Buffer.from(picture.data) }
      : undefined;
  }

  async saveProfilePicture(
    userId: string,
    mimeType: string,
    data: Buffer,
    context: UserProfileAuditContext = {},
  ): Promise<{ profilePictureUpdatedAt: string }> {
    return this.dataSource.transaction(async (manager) => {
      await this.requireIndependentSuperAdmin(manager, userId);
      const rows = await manager.query<
        Array<{ profilePictureUpdatedAt: Date | string }>
      >(
        `UPDATE user_profiles
         SET profile_picture_mime_type = $2,
             profile_picture_data = $3,
             profile_picture_updated_at = now(),
             updated_at = now()
         WHERE user_id = $1
         RETURNING profile_picture_updated_at AS "profilePictureUpdatedAt"`,
        [userId, mimeType, data],
      );
      if (!rows[0]) {
        throw new NotFoundException('Complete your profile before uploading a photo.');
      }
      await this.writeAudit(
        manager,
        userId,
        'USER_PROFILE_PICTURE_UPDATED',
        ['profilePicture'],
        context,
      );
      return { profilePictureUpdatedAt: dateTime(rows[0].profilePictureUpdatedAt)! };
    });
  }

  async deleteProfilePicture(
    userId: string,
    context: UserProfileAuditContext = {},
  ): Promise<{ removed: true }> {
    return this.dataSource.transaction(async (manager) => {
      await this.requireIndependentSuperAdmin(manager, userId);
      const rows = await manager.query<Array<{ userId: string }>>(
        `UPDATE user_profiles
         SET profile_picture_mime_type = NULL,
             profile_picture_data = NULL,
             profile_picture_updated_at = NULL,
             updated_at = now()
         WHERE user_id = $1 AND profile_picture_data IS NOT NULL
         RETURNING user_id AS "userId"`,
        [userId],
      );
      if (rows[0]) {
        await this.writeAudit(
          manager,
          userId,
          'USER_PROFILE_PICTURE_REMOVED',
          ['profilePicture'],
          context,
        );
      }
      return { removed: true };
    });
  }

  private async requireIndependentSuperAdmin(
    manager: EntityManager,
    userId: string,
  ): Promise<AccountRow> {
    const rows = await manager.query<AccountRow[]>(
      `SELECT id AS "userId", email, role, status,
              employee_id AS "employeeId", created_at AS "accountCreatedAt",
              last_login_at AS "lastLoginAt"
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId],
    );
    const account = rows[0];
    if (!account) throw new NotFoundException('User account not found.');
    this.requireActiveSuperAdmin(account);
    if (account.employeeId) {
      throw new ForbiddenException(
        'Linked employee accounts must use their employee profile.',
      );
    }
    return account;
  }

  private requireActiveSuperAdmin(account: AccountRow): void {
    if (account.role !== 'SUPER_ADMIN' || account.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Independent profiles are available only to active Super Admin accounts.',
      );
    }
  }

  private async writeAudit(
    manager: EntityManager,
    userId: string,
    action: string,
    changedFields: readonly string[],
    context: UserProfileAuditContext,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO audit_logs
         (id, user_id, branch_id, action, resource, details, created_at)
       VALUES ($1, $2, NULL, $3, $4, $5, now())`,
      [
        randomUUID(),
        userId,
        action,
        `user-profile:${userId}`,
        JSON.stringify({ changedFields, ip: context.ip, userAgent: context.userAgent }),
      ],
    );
  }
}
