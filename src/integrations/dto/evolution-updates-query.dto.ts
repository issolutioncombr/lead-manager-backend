import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class EvolutionUpdatesQueryDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/)
  phone!: string;

  @IsOptional()
  @IsString()
  instanceId?: string;

  @IsOptional()
  @IsIn(['provider', 'local'])
  source?: 'provider' | 'local';

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @IsString()
  afterTimestamp?: string;

  @IsOptional()
  @IsString()
  afterUpdatedAt?: string;
}
