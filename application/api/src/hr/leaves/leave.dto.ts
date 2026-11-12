import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
const boolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
export class RequestDto {
  @IsUUID() typeId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate!: string;
  @IsOptional() @Transform(boolean) @IsBoolean() halfDay?: boolean;
  @IsString() @Length(1, 1000) reason!: string;
  @IsUUID() submissionKey!: string;
}
export class PreviewDto {
  @IsUUID() typeId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate!: string;
  @IsOptional() @Transform(boolean) @IsBoolean() halfDay?: boolean;
}
export class FilterDto {
  @IsOptional() @IsString() @Length(1, 100) employeeId?: string;
  @IsOptional() @IsString() @Length(1, 100) branchId?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: string;
}
export class CommentDto {
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
export class CancellationResponseDto {
  @IsIn(['CONFIRM', 'CONTINUE', 'RESCHEDULE']) action!:
    'CONFIRM' | 'CONTINUE' | 'RESCHEDULE';
  @IsString() @Length(1, 1000) comment!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
}
export class CancellationDecisionDto {
  @IsIn(['APPROVE', 'REJECT']) action!: 'APPROVE' | 'REJECT';
  @IsString() @Length(1, 1000) comment!: string;
}
export class AdjustmentDto {
  @IsUUID() typeId!: string;
  @Type(() => Number) @IsInt() @Min(2000) @Max(2200) year!: number;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(-366)
  @Max(366)
  days!: number;
  @IsString() @Length(1, 1000) reason!: string;
  @IsUUID() key!: string;
}
export class AllocateDto {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2200) year!: number;
  @IsString() @Length(1, 1000) reason!: string;
}
export class ResetScheduleDto {
  @IsUUID() typeId!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) nextDate?: string;
}
export class ResetBalanceDto {
  @IsUUID() typeId!: string;
  @IsUUID() key!: string;
  @IsString() @Length(1, 800) reason!: string;
}
export class TypeDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,19}$/) code!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsString() @MaxLength(1000) description!: string;
  @IsBoolean() active!: boolean;
  @IsInt() @Min(1) version!: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom!: string;
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(366) annualDays!: number;
  @IsBoolean() paid!: boolean;
  @IsIn(['ACTIVE', 'REGULAR', 'ASSIGNED']) eligibility!:
    'ACTIVE' | 'REGULAR' | 'ASSIGNED';
  @IsIn(['ANNUAL', 'MANUAL']) frequency!: 'ANNUAL' | 'MANUAL';
  @IsBoolean() halfDay!: boolean;
  @IsIn(['OPTIONAL', 'REQUIRED', 'NONE']) attachmentRule!:
    'OPTIONAL' | 'REQUIRED' | 'NONE';
  @IsBoolean() automaticAllocation!: boolean;
  @IsBoolean() blockInsufficient!: boolean;
  @IsInt() @Min(0) @Max(600) minimumServiceMonths!: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) minimumNoticeDays?: number;
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  employmentTypes!: string[];
  @IsOptional() @IsString() @Length(1, 100) branchId?: string | null;
  @IsBoolean() allowApprovedCancellation!: boolean;
}
export class AssignmentDto {
  @IsUUID() typeId!: string;
  @IsString() @Length(1, 100) employeeId!: string;
  @IsBoolean() eligible!: boolean;
  @IsBoolean() silVerified!: boolean;
  @IsString() @Length(1, 500) reason!: string;
}
