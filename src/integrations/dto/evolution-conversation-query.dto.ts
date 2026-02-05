import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, IsIn, IsInt, Max, Min } from 'class-validator';

export class EvolutionConversationQueryDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/)
  phone!: string;

  @IsOptional()
  @IsString()
  instanceId?: string;

  @IsOptional()
  @IsString()
  remoteJid?: string;

  @IsOptional()
  @IsIn(['inbound', 'outbound'])
  direction?: 'inbound' | 'outbound';

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsIn(['provider', 'local'])
  source?: 'provider' | 'local';
}
