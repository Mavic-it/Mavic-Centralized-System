import { Transform } from 'class-transformer';
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
  Matches,
} from 'class-validator';
import {
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUSES,
  type EmploymentType,
} from './employee-options.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class UpdateEmployeeDto {
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(500)
  @IsString({ each: true }) @Length(1, 100, { each: true })
  workBranchIds?: string[];
  @IsOptional() @IsBoolean() allWorkBranches?: boolean;
  @IsOptional() @IsDateString() effectiveDate?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 200) name?: string;
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) branchId?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 150) position?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  department?: string;
  @IsOptional() @IsIn(EMPLOYMENT_TYPES) employmentType?: EmploymentType;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString({ strict: true }) probationEndDate?:
    string | null;
  @IsOptional() @IsDateString({ strict: true }) evaluationDueDate?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) manager?: string;
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100)
  managerEmployeeId?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) phone?: string;
  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES)
  status?: (typeof EMPLOYEE_STATUSES)[number];
}

export class AddEmployeeDocumentDto {
  @Transform(trim) @IsString() @Length(1, 200) label!: string;
  @Transform(trim) @IsString() @Length(1, 100) kind!: string;
  @IsDateString() updated!: string;
  @Transform(trim) @IsString() @MaxLength(255) fileName!: string;
}

export class UpdateEmergencyContactDto {
  @Transform(trim) @IsString() @Length(1, 200) name!: string;
  @Transform(trim) @IsString() @Length(1, 100) relationship!: string;
  @Transform(trim)
  @IsString()
  @Matches(/^\+?(?:[0-9][ ()-]*){7,15}$/, {
    message: 'Enter a valid phone number with 7 to 15 digits.',
  })
  phone!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^$|^\+?(?:[0-9][ ()-]*){7,15}$/, {
    message: 'Enter a valid employee phone number with 7 to 15 digits.',
  })
  employeePhone?: string;
}
