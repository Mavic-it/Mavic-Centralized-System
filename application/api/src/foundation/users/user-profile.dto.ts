import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class UpdateOwnUserProfileDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName!: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  middleName?: string | null;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  lastName!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 150)
  displayName!: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsDateString({ strict: true })
  dateOfBirth?: string | null;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  gender?: string | null;

  @Transform(trim)
  @IsString()
  @Length(1, 50)
  contactNumber!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  homeAddress!: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @Length(1, 200)
  emergencyContactName?: string | null;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactRelationship?: string | null;

  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @Length(1, 50)
  emergencyContactNumber?: string | null;
}
