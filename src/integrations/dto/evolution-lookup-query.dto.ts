import { IsOptional, IsString } from 'class-validator';

export class EvolutionLookupQueryDto {
  @IsOptional()
  @IsString()
  instanceId?: string;

  @IsOptional()
  @IsString()
  providerInstanceId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
