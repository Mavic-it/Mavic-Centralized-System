import {
  IsDateString,
  IsIn,
  Length,
  IsOptional,
  IsString,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateEmployeeDocumentDto {
  @IsIn(['GOVERNMENT_ID', 'CONTRACT_RECORD']) category!:
    'GOVERNMENT_ID' | 'CONTRACT_RECORD';
  @IsOptional() @IsString() @Length(1, 100) documentType?: string;
  @IsOptional() @IsString() @Length(1, 255) fileName?: string;
  @IsOptional() @IsDateString() expirationDate?: string;
  @IsOptional() @IsString() @Length(1, 100) requirementId?: string;
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateEmployeeDocumentRequirementDto {
  @Transform(trim) @IsString() @Length(1, 150) name!: string;
  @IsIn(['GOVERNMENT_ID', 'CONTRACT_RECORD']) category!:
    'GOVERNMENT_ID' | 'CONTRACT_RECORD';
  @IsBoolean() isRequired!: boolean;
}

export class UpdateEmployeeDocumentRequirementDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 150) name?: string;
  @IsOptional() @IsIn(['GOVERNMENT_ID', 'CONTRACT_RECORD']) category?:
    'GOVERNMENT_ID' | 'CONTRACT_RECORD';
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AttachEmployeeDocumentRequirementDto {
  @IsString() @Length(1, 100) requirementId!: string;
}
