import { IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class EvolutionSendMessageDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsUrl()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caption?: string;

  @IsOptional()
  @IsString()
  clientMessageId?: string;

  @IsOptional()
  @IsString()
  instanceId?: string;
}
