import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export class DtrQueryDto {
  @IsString() @Length(1, 100) branchId!: string;
  @Matches(datePattern) from!: string;
  @Matches(datePattern) to!: string;
  @IsOptional() @IsString() @Length(1, 100) employeeId?: string;
}
export class DtrTemplateDto {
  @IsIn(['AUTO', 'PUNCH', 'DAILY']) kind!: 'AUTO' | 'PUNCH' | 'DAILY';
  @IsOptional() @IsInt() @Min(1) @Max(20) headerRow?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  sheets?: string[];
  @IsIn(['MDY', 'DMY', 'ISO']) dateOrder!: 'MDY' | 'DMY' | 'ISO';
  @IsOptional() @Matches(datePattern) date?: string;
  @IsIn(['STRICT', 'FIRST_LAST']) pairing!: 'STRICT' | 'FIRST_LAST';
  @IsOptional() @IsObject() fields?: Record<string, string>;
}
export class DtrSaveTemplateDto {
  @IsString() @Length(1, 100) branchId!: string;
  @IsString() @Length(1, 100) name!: string;
  @IsObject()
  @IsDefined()
  @ValidateNested()
  @Type(() => DtrTemplateDto)
  configuration!: DtrTemplateDto;
}
export class DtrMappingDto {
  @IsString() @Length(1, 1000) key!: string;
  @IsString() @Length(1, 100) employeeId!: string;
}
export class DtrOverrideDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)
  actualIn?: string | null;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)
  actualOut?: string | null;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) shiftStart?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) shiftEnd?: string;
  @IsOptional() @IsIn(['NORMAL', 'WFH', 'OB', 'RD']) arrangement?:
    'NORMAL' | 'WFH' | 'OB' | 'RD';
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
  @IsOptional() @IsBoolean() noOt?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(2160) approvedOtMinutes?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  resolvedExceptions?: string[];
}
export class DtrPreviewDayDto {
  @IsString() @Length(1, 100) employeeId!: string;
  @Matches(datePattern) workDate!: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) shiftStart?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) shiftEnd?: string;
  @IsOptional() @IsIn(['NORMAL', 'WFH', 'OB']) arrangement?: 'NORMAL' | 'WFH' | 'OB';
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}
export class DtrImportSelectionDto {
  @IsString() @Length(1, 100) branchId!: string;
  @Matches(datePattern) from!: string;
  @Matches(datePattern) to!: string;
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => DtrMappingDto)
  mappings!: DtrMappingDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20000)
  @ValidateNested({ each: true }) @Type(() => DtrPreviewDayDto)
  dayOverrides?: DtrPreviewDayDto[];
}
export class DtrCommitDto extends DtrImportSelectionDto {
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) contextHash?: string;
  @IsIn(['REJECT', 'REPLACE']) overlap!: 'REJECT' | 'REPLACE';
  @IsString() @Length(3, 1000) reason!: string;
  @IsOptional() @IsBoolean() reprocess?: boolean;
}
export class DtrUploadDto {
  @IsString() @Length(1, 100) branchId!: string;
  @Matches(datePattern) from!: string;
  @Matches(datePattern) to!: string;
  @IsOptional() @IsString() @Length(1, 100) templateId?: string;
  @IsOptional() @Matches(datePattern) date?: string;
}
export class DtrCorrectionDto {
  @IsString() @Length(1, 100) branchId!: string;
  @IsInt() @Min(1) revision!: number;
  @IsString() @Length(3, 1000) reason!: string;
  @IsObject()
  @IsDefined()
  @ValidateNested()
  @Type(() => DtrOverrideDto)
  override!: DtrOverrideDto;
}
export class DtrPeriodDto extends DtrQueryDto {
  @IsIn(['SAVE', 'APPROVE', 'REOPEN', 'RECALCULATE']) action!:
    'SAVE' | 'APPROVE' | 'REOPEN' | 'RECALCULATE';
  @IsString() @Length(3, 1000) reason!: string;
}
export class DtrExportDto extends DtrQueryDto {
  @IsIn(['csv', 'xlsx']) format!: 'csv' | 'xlsx';
  @IsOptional() @IsIn(['DTR', 'SUMMARY']) report?: 'DTR' | 'SUMMARY';
}
export class DtrPolicyDto {
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) breakStart!:
    string | null;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) breakEnd!: string | null;
  @IsInt() @Min(0) @Max(240) lateGraceMinutes!: number;
  @IsInt() @Min(0) @Max(480) minimumOtMinutes!: number;
  @IsInt() @Min(1) @Max(240) otIncrementMinutes!: number;
}
export class DtrSettingsDto {
  @IsString() @Length(1, 100) branchId!: string;
  @IsObject()
  @IsDefined()
  @ValidateNested()
  @Type(() => DtrPolicyDto)
  policy!: DtrPolicyDto;
  @IsObject() holidays!: Record<string, string>;
  @IsString() @Length(3, 1000) reason!: string;
}
