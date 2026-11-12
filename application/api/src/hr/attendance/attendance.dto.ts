import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AttendanceQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) branchId?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  employeeId?: string;
}

export class AttendanceScheduleDto {
  @Transform(trim) @IsString() @MaxLength(100) timeZone!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workDays!: number[];

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  shiftStart!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  shiftEnd!: string;

  @IsInt() @Min(0) @Max(720) breakMinutes!: number;
  @IsInt() @Min(0) @Max(240) graceMinutes!: number;
}

export class BranchAttendanceScheduleDto extends AttendanceScheduleDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  defaultLocation?: string | null;
}

export class AttendanceWorkRosterQueryDto {
  @Transform(trim) @IsString() @MaxLength(100) branchId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) weekStart!: string;
}

export class EmployeeWorkScheduleWeekQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) weekStart!: string;
}

export class AttendanceWorkRosterDayDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) workDate!: string;
  @IsIn(['WORK', 'REST_DAY']) dayType!: 'WORK' | 'REST_DAY';
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) shiftStart?: string | null;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) shiftEnd?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) assignmentLabel?: string | null;
}

export class AttendanceWorkRosterEmployeeDto {
  @Transform(trim) @IsString() @MaxLength(100) employeeId!: string;
  @IsArray() @ArrayMinSize(7) @ArrayMaxSize(7) @ArrayUnique((day: AttendanceWorkRosterDayDto) => day.workDate)
  @ValidateNested({ each: true }) @Type(() => AttendanceWorkRosterDayDto)
  days!: AttendanceWorkRosterDayDto[];
}

export class AttendanceWorkRosterSaveDto {
  @Transform(trim) @IsString() @MaxLength(100) branchId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) weekStart!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000)
  @ArrayUnique((employee: AttendanceWorkRosterEmployeeDto) => employee.employeeId)
  @ValidateNested({ each: true }) @Type(() => AttendanceWorkRosterEmployeeDto)
  employees!: AttendanceWorkRosterEmployeeDto[];
}

export class EmployeeWorkScheduleAssignmentDto extends AttendanceScheduleDto {
  @IsDateString() effectiveDate!: string;
}

export class AttendanceCorrectionDto {
  @IsOptional() @IsDateString() timeIn?: string;
  @IsOptional() @IsDateString() timeOut?: string;
  @IsOptional() @IsIn(['CORRECTION', 'MANUAL_ADJUSTMENT'])
  changeType?: 'CORRECTION' | 'MANUAL_ADJUSTMENT';
  @Transform(trim) @IsString() @Min(10) @MaxLength(500) reason!: string;
}

export class AttendanceOvertimeDecisionDto {
  @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';

  @Transform(trim) @IsString() @Min(10) @MaxLength(500) reason!: string;
}
