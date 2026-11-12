import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
export class ObFilingDto {
  @IsOptional() @IsString() @Length(1, 100) employeeId?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) workDate!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
  @Matches(/^\d{2}:\d{2}$/) startTime!: string;
  @Matches(/^\d{2}:\d{2}$/) endTime!: string;
  @IsOptional() @IsBoolean() nextDay?: boolean;
  @IsString() @Length(1, 200) destination!: string;
  @IsOptional() @IsString() @Length(1, 100) destinationBranchId?: string;
  @IsString() @Length(1, 2000) reason!: string;
  @IsOptional() @IsString() @Length(1, 1000) retrospectiveReason?: string;
  @IsUUID() submissionKey!: string;
}
export class ObDecisionDto {
  @IsInt() @Min(1) version!: number;
  @IsIn([
    'APPROVE',
    'REJECT',
    'CANCEL',
    'REQUEST_CANCELLATION',
    'APPROVE_CANCELLATION',
    'REJECT_CANCELLATION',
  ])
  action!: string;
  @IsString() @Length(1, 2000) comment!: string;
  @IsOptional() @IsBoolean() officeContinuity?: boolean;
}
export class ObFilterDto {
  @IsOptional() @IsIn(['mine', 'review']) view?: string;
  @IsOptional() @IsString() @Length(1, 100) branchId?: string;
  @IsOptional() @IsString() @Length(1, 100) employeeId?: string;
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
}
