import { Type, Transform } from 'class-transformer';
import {
  IsIn,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
export const categories = [
  'ATTENDANCE',
  'TIMEKEEPING',
  'CONDUCT',
  'POLICY',
  'PERFORMANCE',
  'SECURITY',
  'PROPERTY',
  'SAFETY',
  'OTHER',
] as const;
export class CreateTaskDto {
  @IsUUID() submissionKey!: string;
  @IsOptional() @IsString() @Length(1, 100) employeeId?: string;
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  employeeIds?: string[];
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;
  @IsString() @Length(1, 160) title!: string;
  @IsString() @Length(1, 8000) description!: string;
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate!: string;
  @IsOptional() @IsIn(['DAILY', 'WEEKLY', 'MONTHLY']) recurrence?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) recurrenceEndDate?: string;
  @IsOptional() @IsUUID() templateId?: string;
}

export class TaskTemplateQueryDto {
  @IsString() @Length(1, 100) branchId!: string;
}

export class CreateTaskTemplateDto {
  @IsString() @Length(1, 100) branchId!: string;
  @IsString() @Length(1, 80) name!: string;
  @IsString() @Length(1, 160) title!: string;
  @IsString() @Length(1, 8000) description!: string;
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority!: string;
}

export class TaskExportQueryDto {
  @IsIn(['xlsx', 'pdf']) format!: 'xlsx' | 'pdf';
  @IsOptional() @IsString() @Length(1, 100) assigneeId?: string;
  @IsOptional() @IsString() @Length(1, 100) branchId?: string;
  @IsOptional() @IsString() @Length(1, 40) status?: string;
  @IsOptional() @IsIn(['mine', 'team']) view?: string;
  @IsOptional() @IsString() @Length(0, 120) search?: string;
}
export class StopTaskSeriesDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}
export class CreateIncidentDto {
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) incidentTime?: string;
  @IsOptional() @IsString() @Length(0, 4000) remarks?: string;
  @IsOptional() @IsIn(['SELF', 'GENERAL']) reportMode?: string;
  @IsOptional() @IsIn(['BRANCH', 'GENERAL']) reportScope?: string;
  @IsUUID() submissionKey!: string;
  @IsString() @Length(1, 100) branchId!: string;
  @IsOptional() @IsString() @Length(1, 100) employeeId?: string;
  @IsString() @Length(1, 160) title!: string;
  @IsString() @Length(1, 8000) description!: string;
  @IsIn(categories) category!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) incidentDate!: string;
}
export class WorkActionDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsIn([
    'STATUS',
    'START',
    'PROGRESS',
    'SUBMIT',
    'ACCEPT',
    'CHANGES',
    'CANCEL',
    'REASSIGN',
    'COMMENT',
    'REVIEW',
    'REQUEST_DETAILS',
    'ESCALATE',
    'NOTICE',
    'ACKNOWLEDGE',
    'RESPONSE',
    'DECIDE',
    'CLOSE',
    'ASSIGN_REVIEWER',
    'SET_SUBJECT',
    'RECEIVE',
    'CLARIFY',
    'EXPLAIN',
    'HR_ESCALATE',
    'RESOLVE',
    'WITHDRAW',
    'DISMISS',
  ])
  action!: string;
  @IsOptional() @IsString() @Length(1, 8000) findings?: string;
  @IsOptional() @IsIn(['NO_VIOLATION', 'CONFIRMED']) outcome?: string;
  @IsOptional()
  @IsIn(['NONE', 'WARNING', 'REPRIMAND', 'SUSPENSION', 'OTHER'])
  disciplinaryAction?: string;
  @IsOptional() @IsString() @Length(1, 4000) actionDetails?: string;
  @IsOptional()
  @IsIn(['NOT_STARTED', 'STARTED', 'IN_PROGRESS', 'STUCK', 'DONE'])
  taskState?: string;
  @IsOptional() @IsString() @Length(0, 8000) message?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @IsOptional() @IsString() @Length(1, 100) reviewerId?: string;
  @IsOptional() @IsString() @Length(1, 100) employeeId?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  employeeIds?: string[];
  @IsOptional() @IsIn(['INTERNAL', 'REPORTER', 'SUBJECT']) audience?: string;
}
export class WorkFilterDto {
  @IsOptional() @IsIn(categories) category?: string;
  @IsOptional() @IsString() @Length(1, 100) employeeId?: string;
  @IsOptional() @IsString() @Length(1, 100) assigneeId?: string;
  @IsOptional() @IsString() @Length(1, 100) branchId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @IsOptional() @IsString() @Length(1, 40) status?: string;
  @IsOptional() @IsIn(['mine', 'team']) view?: string;
  @IsOptional() @IsString() @Length(0, 120) search?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional()
  @IsIn(['reports', 'active-cases', 'case-history'])
  queue?: string;
}

export class IncidentAuthorityDto {
  @IsString() @Length(1, 100) userId!: string;
  @IsBoolean() granted!: boolean;
  @IsString() @Length(1, 2000) reason!: string;
}
export class IncidentExportQueryDto extends WorkFilterDto {
  @IsOptional() @IsIn(['xlsx', 'pdf']) format?: 'xlsx' | 'pdf';
}

export class RecordOffenseDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsIn(['AUTO', '1', '2', '3', 'NONE']) offense!: string;
  @IsString() @Length(1, 2000) reason!: string;
}
