import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ModuleAccessChangeDto {
  @IsString() @Length(1,160) permissionKey!: string;
  @IsIn(['INHERIT','VIEW','EDIT','DENY']) effect!: 'INHERIT'|'VIEW'|'EDIT'|'DENY';
}

export class UpdateModuleAccessDto {
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsString({ each: true }) @Length(1,160,{each:true}) permissionKeys?: string[];
  @IsOptional() @IsIn(['INHERIT','VIEW','EDIT','DENY']) effect?: 'INHERIT' | 'VIEW' | 'EDIT' | 'DENY';
  @IsOptional() @IsString() @Length(6,100) confirmation?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>ModuleAccessChangeDto) changes?: ModuleAccessChangeDto[];
}

export class BulkModuleAccessDto {
  @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsString({each:true}) @Length(1,100,{each:true}) userIds!: string[];
  @IsString() @Length(1,160) permissionKey!: string;
  @IsIn(['INHERIT','VIEW','EDIT','DENY']) effect!: 'INHERIT'|'VIEW'|'EDIT'|'DENY';
  @IsString() @Length(6,100) confirmation!: string;
}
