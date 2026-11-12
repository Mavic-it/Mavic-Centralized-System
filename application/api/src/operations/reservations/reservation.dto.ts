import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Matches,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ReservationQueryDto {
  @IsOptional() @IsString() @MaxLength(100) branchId?: string;
  @IsOptional()
  @IsIn([
    'PENDING',
    'CONFIRMED',
    'CHECKED_IN',
    'COMPLETED',
    'CANCELLED',
    'REJECTED',
    'NO_SHOW',
  ])
  status?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class CreateReservationDto {
  @IsString() @IsNotEmpty() @MaxLength(100) branchId!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) roomId!: string;
  @IsISO8601() startAt!: string;
  @IsISO8601() endAt!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) guestCount!: number;
  @IsString() @IsNotEmpty() @MaxLength(1000) purpose!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) customerName!: string;
  @IsEmail() @MaxLength(320) customerEmail!: string;
  @IsString() @IsNotEmpty() @MaxLength(50) customerPhone!: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(2000) specialRequests?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ReservationReasonDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class ReservationPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
  @IsString() @IsNotEmpty() @MaxLength(50) method!: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ReservationSpaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(65000)
  @Matches(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/)
  imageData?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(100) branchId!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsIn([
    'MEETING_ROOM',
    'CONFERENCE_ROOM',
    'COWORKING_DESK',
    'PRIVATE_OFFICE',
    'EVENT_SPACE',
    'OTHER',
  ])
  type!: string;
  @IsString() @MaxLength(50) floor!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) capacity!: number;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  hourlyRate?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  bufferMinutes?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() publicBookable?: boolean;
}

export class SpaceBlockDto {
  @IsISO8601() startAt!: string;
  @IsISO8601() endAt!: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}

export class ReservationSettingsDto {
  @IsBoolean() autoConfirm!: boolean;
  @Type(() => Number) @IsInt() @Min(0) @Max(10080) minAdvanceMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1095) maxAdvanceDays!: number;
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(1440)
  defaultDurationMinutes!: number;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  openTime!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closeTime!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @ArrayUnique()
  @IsInt({ each: true }) @IsIn([1, 2, 3, 4, 5, 6, 7], { each: true })
  allowedDays!: number[];
}
