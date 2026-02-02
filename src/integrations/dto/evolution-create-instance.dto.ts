import { IsOptional, IsString, IsUrl } from 'class-validator';

export class EvolutionCreateInstanceDto {
  @IsOptional()
  @IsString()
  instanceName?: string;

  @IsOptional()
  @IsUrl()
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  slotId?: string;
}
