import {
  IsIn,
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class ResetUserPasswordDto {
  @IsString()
  @Length(12, 128)
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain a number' })
  password!: string;
}

export class UpdateUserStatusDto {
  @IsString()
  @Length(6, 8)
  @Matches(/^(ACTIVE|INACTIVE|ARCHIVED)$/)
  status!: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

export class UpdateUserRoleDto {
  @IsIn([
    'SUPER_ADMIN',
    'IT_ADMIN',
    'HR_ADMIN',
    'BRANCH_MANAGER',
    'STAFF',
    'EMPLOYEE',
  ])
  role!: string;

  @ValidateIf((input: UpdateUserRoleDto) => input.role !== 'SUPER_ADMIN')
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  employeeId?: string;

  @ValidateIf((input: UpdateUserRoleDto) => input.role !== 'SUPER_ADMIN')
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  branchId?: string | null;
}

export class UpdateUserBranchDto {
  @IsString()
  @Length(1, 100)
  branchId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  department?: string;
}

export class AdminBranchAccessDto {
  @IsIn(['ASSIGNED','SELECTED','ALL']) mode!: 'ASSIGNED' | 'SELECTED' | 'ALL';
  @IsArray() @ArrayUnique() @ArrayMaxSize(1000) @IsString({each:true}) @Length(1,100,{each:true}) branchIds!: string[];
}
