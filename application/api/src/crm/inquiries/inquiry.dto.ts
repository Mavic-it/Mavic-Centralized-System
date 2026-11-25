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
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { inquiryStatuses, lookupKinds } from './inquiry.domain.js';

export class InquiryQueryDto {
  @IsOptional() @IsISO8601({ strict: true }) followUpFrom?: string;
  @IsOptional() @IsISO8601({ strict: true }) followUpTo?: string;
  @IsOptional() @IsString() @MaxLength(1000) lostReason?: string;
  @IsOptional()
  @IsIn([
    'mine',
    'team',
    'today',
    'upcoming',
    'overdue',
    'completed',
    'cancelled',
  ])
  followUpQueue = 'mine';
  @IsOptional() @IsIn(['label', 'count', 'converted']) reportSort = 'label';
  @IsOptional() @IsIn(['csv', 'xlsx', 'pdf']) format = 'csv';
  @IsOptional() @IsIn(['true', 'false']) summary?: string;
  @IsOptional() @IsIn(['day', 'week', 'month', 'quarter', 'year']) grouping =
    'month';
  @IsOptional()
  @IsIn([
    'active',
    'noResponse',
    'new',
    'pendingReservations',
    'reserved',
    'converted',
    'lost',
    'legacyReserved',
    'followUpsToday',
    'overdueFollowUps',
  ])
  metric?: string;
  @IsOptional() @IsString() @MaxLength(100) branchId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(inquiryStatuses) status?: string;
  @IsOptional() @IsString() @MaxLength(100) serviceId?: string;
  @IsOptional() @IsString() @MaxLength(100) sourceId?: string;
  @IsOptional() @IsString() @MaxLength(100) channelId?: string;
  @IsOptional() @IsString() @MaxLength(100) assignedStaffId?: string;
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;
  @IsOptional() @IsIn(['true', 'false']) archived?: string;
  @IsOptional() @IsIn(['date', 'client', 'updated', 'reference']) sort = 'date';
  @IsOptional() @IsIn(['ASC', 'DESC']) direction = 'DESC';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
export class SaveInquiryDto {
  @IsOptional()
  @IsIn([
    'NEW',
    'IN_PROGRESS',
    'FOLLOW_UP',
    'NO_RESPONSE',
    'OCULAR_SCHEDULED',
    'PROPOSAL_SENT',
  ])
  initialStatus?: string;
  @IsString() @MaxLength(100) branchId!: string;
  @IsString() @MaxLength(200) clientName!: string;
  @IsOptional() @IsString() @MaxLength(100) customerId?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(200) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  inquiryDate!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  preferredBranchIds!: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  serviceIds!: string[];
  @IsString() @MaxLength(100) channelId!: string;
  @IsOptional() @IsString() @MaxLength(100) sourceId?: string;
  @IsString() @MaxLength(100) assignedStaffId!: string;
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority = 'NORMAL';
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(5000) requirements?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999)
  budget?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000) pax?: number;
  @IsOptional() @IsISO8601({ strict: true }) preferredStart?: string;
  @IsOptional() @IsISO8601({ strict: true }) preferredEnd?: string;
  @IsOptional() @IsString() @MaxLength(1000) nextAction?: string;
  @IsOptional() @IsISO8601({ strict: true }) followUpAt?: string;
  @IsOptional() @IsString() @MaxLength(5000) actionTaken?: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class InquiryBranchQueryDto {
  @IsString() @MaxLength(100) branchId!: string;
}
export class InquiryCustomerQueryDto extends InquiryBranchQueryDto {
  @IsString() @MaxLength(320) search!: string;
}
export class InquiryActionDto {
  @IsInt() @Min(1) version!: number;
  @IsOptional() @IsIn(inquiryStatuses) status?: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @IsBoolean() archived?: boolean;
}
export class InquiryActivityDto {
  @IsString() @MaxLength(100) type!: string;
  @IsString() @MaxLength(5000) description!: string;
}
export class InquiryTaskDto {
  @IsOptional()
  @IsIn(['CALL', 'MESSAGE', 'EMAIL', 'OCULAR', 'FOLLOW_UP', 'OTHER'])
  actionType?: string = 'FOLLOW_UP';
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: string =
    'NORMAL';
  @IsString() @MaxLength(1000) description!: string;
  @IsISO8601({ strict: true }) dueAt!: string;
}
export class InquiryRescheduleDto {
  @IsInt() @Min(1) version!: number;
  @IsISO8601({ strict: true }) dueAt!: string;
  @IsString() @MaxLength(1000) reason!: string;
}
export class InquiryReminderPolicyDto {
  @IsBoolean() enabled = true;
  @IsBoolean() overdueEnabled = true;
  @IsInt() @Min(0) @Max(10080) leadMinutes = 0;
  @IsInt() @Min(0) @Max(720) escalationHours = 0;
}
export class InquiryTaskResultDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(['COMPLETED', 'CANCELLED']) status!: string;
  @IsString() @MaxLength(5000) result!: string;
}
export class InquiryLookupDto {
  @IsIn(lookupKinds) kind!: string;
  @IsString() @MaxLength(150) label!: string;
  @IsInt() @Min(0) @Max(10000) position = 0;
  @IsBoolean() active = true;
  @IsBoolean() reservable = false;
}
export class InquiryBulkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  ids!: string[];
  @IsBoolean() archived!: boolean;
  @IsString() @MaxLength(1000) reason!: string;
}
export class InquiryConversionDto {
  @IsInt() @Min(1) version!: number;
  @IsString() @MaxLength(5000) evidence!: string;
}
