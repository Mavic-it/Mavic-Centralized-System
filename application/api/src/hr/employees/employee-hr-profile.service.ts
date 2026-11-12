import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { UpdateEmployeeHrProfileDto } from './employee-hr-profile.dto.js';
import { JOB_LEVELS } from './employee-options.js';

export type EmployeeHrProfile = {
  employeeId: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  preferredName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  civilStatus: string | null;
  nationality: string | null;
  personalEmail: string | null;
  currentAddress: string | null;
  permanentAddress: string | null;
  jobLevel: string | null;
  salaryGrade: string | null;
  basicSalary: number | null;
  workSchedule: string | null;
  shift: string | null;
  probationary: boolean | null;
  regularizationDate: string | null;
  separationDate: string | null;
  separationReason: string | null;
};

type ProfileKey = Exclude<
  keyof EmployeeHrProfile,
  'employeeId' | 'workSchedule' | 'shift'
>;

const columns: Record<ProfileKey, string> = {
  firstName: 'first_name',
  middleName: 'middle_name',
  lastName: 'last_name',
  suffix: 'suffix',
  preferredName: 'preferred_name',
  dateOfBirth: 'date_of_birth',
  gender: 'gender',
  civilStatus: 'civil_status',
  nationality: 'nationality',
  personalEmail: 'personal_email',
  currentAddress: 'current_address',
  permanentAddress: 'permanent_address',
  jobLevel: 'job_level',
  salaryGrade: 'salary_grade',
  basicSalary: 'basic_salary',
  probationary: 'probationary',
  regularizationDate: 'regularization_date',
  separationDate: 'separation_date',
  separationReason: 'separation_reason',
};

const selectColumns = Object.entries(columns)
  .map(([property, column]) => `${column} AS "${property}"`)
  .concat(['work_schedule AS "workSchedule"', 'shift AS "shift"'])
  .join(', ');

export class EmployeeHrProfileService {
  constructor(private readonly dataSource: DataSource) {}

  async findByEmployeeId(
    employeeId: string,
  ): Promise<EmployeeHrProfile | undefined> {
    const rows = await this.dataSource.query<EmployeeHrProfile[]>(
      `SELECT employee_id AS "employeeId", ${selectColumns}
       FROM employee_profiles WHERE employee_id = $1`,
      [employeeId],
    );
    return rows[0] ? this.normalize(rows[0]) : undefined;
  }

  async update(
    employeeId: string,
    input: UpdateEmployeeHrProfileDto,
    branchId: string,
    actor: { userId: string; ip?: string; userAgent?: string },
  ): Promise<EmployeeHrProfile> {
    const fields = (Object.keys(columns) as ProfileKey[]).filter(
      (field) => input[field] !== undefined,
    );
    if (fields.length === 0) {
      throw new BadRequestException(
        'Provide at least one profile field to update.',
      );
    }
    const names = fields.map((field) => columns[field]);
    const values = fields.map((field) => input[field]);
    const valuePlaceholders = fields.map((_, index) => `$${index + 2}`);
    const updateExpressions = names.map(
      (column) => `${column} = EXCLUDED.${column}`,
    );
    const parameters = [employeeId, ...values];
    return this.dataSource.transaction(async (manager) => {
      const previousRows = await manager.query<EmployeeHrProfile[]>(
        `SELECT employee_id AS "employeeId", ${selectColumns}
         FROM employee_profiles WHERE employee_id = $1 FOR UPDATE`,
        [employeeId],
      );
      if (
        input.jobLevel != null &&
        !(JOB_LEVELS as readonly string[]).includes(input.jobLevel) &&
        input.jobLevel !== previousRows[0]?.jobLevel
      ) {
        throw new BadRequestException(
          'Select Rank and file, Supervisory, or Managerial for job level.',
        );
      }
      const profileRows = await manager.query<EmployeeHrProfile[]>(
        `INSERT INTO employee_profiles
           (employee_id, ${names.join(', ')}, updated_at)
         VALUES ($1, ${valuePlaceholders.join(', ')}, now())
         ON CONFLICT (employee_id) DO UPDATE SET
           ${updateExpressions.join(', ')}, updated_at = now()
         RETURNING employee_id AS "employeeId", ${selectColumns}`,
        parameters,
      );
      await manager.query(
        `INSERT INTO audit_logs
           (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, $4, 'employee_profiles', $5, now())`,
        [
          randomUUID(),
          actor.userId,
          branchId,
          previousRows[0] ? 'UPDATE' : 'CREATE',
          JSON.stringify({
            employeeId,
            changedFields: fields,
            ip: actor.ip,
            userAgent: actor.userAgent,
          }),
        ],
      );
      return this.normalize(profileRows[0]);
    });
  }

  private normalize(profile: EmployeeHrProfile): EmployeeHrProfile {
    return {
      ...profile,
      basicSalary:
        profile.basicSalary === null ? null : Number(profile.basicSalary),
      dateOfBirth: profile.dateOfBirth
        ? String(profile.dateOfBirth).slice(0, 10)
        : null,
      regularizationDate: profile.regularizationDate
        ? String(profile.regularizationDate).slice(0, 10)
        : null,
      separationDate: profile.separationDate
        ? String(profile.separationDate).slice(0, 10)
        : null,
    };
  }
}
