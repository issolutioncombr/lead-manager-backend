import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateLeadStatusDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

