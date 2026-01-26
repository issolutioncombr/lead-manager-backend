import { CampaignStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { Allow, IsDateString, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsString()
  channel!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @Allow()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null)
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
