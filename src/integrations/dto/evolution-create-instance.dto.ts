import { IsOptional, IsString, IsUrl } from 'class-validator';

export class EvolutionCreateInstanceDto {
  @IsString()
  instanceName!: string;

  @IsOptional()
  @IsUrl()
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  slotId?: string;
}
