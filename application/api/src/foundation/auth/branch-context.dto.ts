import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, Length } from 'class-validator';
export class BranchContextDto {
  @IsOptional() @IsString() @Length(1, 100) branchId?: string;
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(1000) @IsString({ each: true }) @Length(1, 100, { each: true }) branchIds?: string[];
  @IsOptional() @IsBoolean() allBranches?: boolean;
}
