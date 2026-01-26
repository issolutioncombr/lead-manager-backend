import { LeadStage } from '@prisma/client';
import { IsArray, IsDateString, IsEmail, IsEnum, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class GoogleFormsPayloadDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @IsOptional()
  @IsInt()
  @Min(0)
  age?: number;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  interest?: string;

  @IsOptional()
  @IsObject()
  anamnesisResponses?: Record<string, unknown>;
}
