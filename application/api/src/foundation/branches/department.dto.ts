import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CreateDepartmentDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 150)
  name!: string;
}

export class UpdateDepartmentDto extends CreateDepartmentDto {}
