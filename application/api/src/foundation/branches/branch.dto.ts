import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  IsNumber,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimNullableString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateBranchDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(2, 50)
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  code!: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @Transform(trimString)
  @IsString()
  @Length(1, 500)
  address!: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 120)
  city!: string;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(120)
  province?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @Matches(/^\+?[0-9(). -]{7,30}$/)
  phone?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsEmail()
  @MaxLength(320)
  email?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(200)
  managerName?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(100)
  managerUserId?: string | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateBranchDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, 500)
  address?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, 120)
  city?: string;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(120)
  province?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @Matches(/^\+?[0-9(). -]{7,30}$/)
  phone?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsEmail()
  @MaxLength(320)
  email?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(200)
  managerName?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(100)
  managerUserId?: string | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}

export class BranchStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}

export class DeleteBranchDto {
  @IsString()
  @Length(1, 256)
  currentPassword!: string;
}
