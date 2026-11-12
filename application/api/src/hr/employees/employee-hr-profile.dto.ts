import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const numberValue = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() ? Number(value) : value;

export class UpdateEmployeeHrProfileDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) firstName?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) middleName?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) lastName?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) suffix?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) preferredName?:
    string | null;
  @IsOptional() @IsDateString() dateOfBirth?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50) gender?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50) civilStatus?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) nationality?:
    string | null;
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  personalEmail?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) currentAddress?:
    string | null;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  permanentAddress?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) jobLevel?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) salaryGrade?:
    string | null;
  @IsOptional()
  @Transform(numberValue)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(999_999_999.99)
  basicSalary?: number | null;
  @IsOptional() @IsBoolean() probationary?: boolean | null;
  @IsOptional() @IsDateString() regularizationDate?: string | null;
  @IsOptional() @IsDateString() separationDate?: string | null;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  separationReason?: string | null;
}
