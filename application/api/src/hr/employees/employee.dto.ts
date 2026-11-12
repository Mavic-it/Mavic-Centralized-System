import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AttendanceScheduleDto } from '../attendance/attendance.dto.js';
import {
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUSES,
  type EmploymentType,
} from './employee-options.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEmployeeDto {
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(500)
  @IsString({ each: true }) @Length(1, 100, { each: true })
  workBranchIds?: string[];
  @IsOptional() @IsBoolean() allWorkBranches?: boolean;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) firstName?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  middleName?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) lastName?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) suffix?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 200) name?: string;
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
  @Transform(trim) @IsString() @Length(1, 100) branchId!: string;
  @Transform(trim) @IsString() @Length(1, 150) position!: string;
  @Transform(trim) @IsString() @Length(1, 150) department!: string;
  @IsIn(EMPLOYMENT_TYPES) employmentType!: EmploymentType;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString({ strict: true }) probationEndDate?:
    string | null;
  @IsOptional() @IsDateString({ strict: true }) evaluationDueDate?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) manager?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  managerEmployeeId?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => AttendanceScheduleDto)
  workSchedule?: AttendanceScheduleDto;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) phone?: string;
  @IsIn(EMPLOYEE_STATUSES) status!: (typeof EMPLOYEE_STATUSES)[number];
}
