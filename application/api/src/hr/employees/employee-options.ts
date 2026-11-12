import { BadRequestException } from '@nestjs/common';
import { isISO8601 } from 'class-validator';

export const EMPLOYMENT_TYPES = [
  'PROBATIONARY',
  'REGULAR',
  'PROJECT_BASED',
  'CONTRACTUAL',
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYEE_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'RESIGNED',
  'RETIRED',
  'TERMINATED',
] as const;
export const JOB_LEVELS = [
  'RANK_AND_FILE',
  'SUPERVISORY',
  'MANAGERIAL',
] as const;

export function validateEmployment(employment: {
  employeeType: EmploymentType;
  startDate: string;
  probationEndDate?: string | null;
  evaluationDueDate?: string | null;
}) {
  if (!EMPLOYMENT_TYPES.includes(employment.employeeType)) {
    throw new BadRequestException('Select a valid employment type.');
  }
  if (employment.employeeType !== 'PROBATIONARY') return;
  for (const [field, label] of [
    ['probationEndDate', 'End of provisionary date'],
    ['evaluationDueDate', 'Evaluation due date'],
  ] as const) {
    const value = employment[field];
    if (
      !value ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !isISO8601(value, { strict: true })
    ) {
      throw new BadRequestException(
        `${label} is required for provisionary employment.`,
      );
    }
    if (value < employment.startDate.slice(0, 10)) {
      throw new BadRequestException(
        `${label} cannot be before the employment start date.`,
      );
    }
  }
}
