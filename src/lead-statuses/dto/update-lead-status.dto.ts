import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateLeadStatusDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

