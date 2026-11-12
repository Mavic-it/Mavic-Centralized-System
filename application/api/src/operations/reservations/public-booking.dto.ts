import { Transform, Type } from 'class-transformer';
import { Equals, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class PublicCancellationDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @Matches(/^RSV-[A-Z0-9]+-[A-Z0-9]+$/) @MaxLength(100) reference!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(320) customerEmail!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}
export class PublicSpaceQuery {
  @IsString() @MinLength(1) @MaxLength(100) branchId!: string;
  @IsOptional() @IsIn(['MEETING_ROOM','CONFERENCE_ROOM','COWORKING_DESK']) type?: string;
}
export class PublicAvailabilityQuery extends PublicSpaceQuery {
  @IsString() @MinLength(1) @MaxLength(100) roomId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) guestCount!: number;
}
export class PublicQuoteDto {
  @IsString() @MinLength(1) @MaxLength(100) branchId!: string;
  @IsString() @MinLength(1) @MaxLength(100) roomId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+08:00$/) startAt!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+08:00$/) endAt!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) guestCount!: number;
}
export class PublicBookingDto {
  @IsString() @MinLength(1) @MaxLength(100) branchId!: string;
  @IsString() @MinLength(1) @MaxLength(100) roomId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+08:00$/) startAt!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+08:00$/) endAt!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) guestCount!: number;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(1000) purpose!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) customerName!: string;
  @Transform(({value}) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(320) customerEmail!: string;
  @Transform(({value}) => typeof value === 'string' ? value.replace(/[\s().-]/g, '') : value)
  @Matches(/^\+?[0-9]{8,15}$/) customerPhone!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) specialRequests?: string;
  @Equals('2026-11-v1') termsVersion!: string;
  @Equals(true) acceptedTerms!: boolean;
  @IsUUID('4') idempotencyKey!: string;
  @IsOptional() @Equals('') website?: string;
}
