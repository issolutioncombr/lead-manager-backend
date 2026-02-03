import { IsOptional, IsString, Matches, IsIn, IsInt, Min } from 'class-validator';

export class EvolutionConversationQueryDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/)
  phone!: string;

  @IsOptional()
  @IsString()
  instanceId?: string;

  @IsOptional()
  @IsIn(['inbound', 'outbound'])
  direction?: 'inbound' | 'outbound';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsIn(['provider', 'local'])
  source?: 'provider' | 'local';
}
