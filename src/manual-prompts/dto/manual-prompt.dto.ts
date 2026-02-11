import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class ManualPromptFaqDto {
  @IsString()
  @MinLength(1)
  question!: string;

  @IsString()
  @MinLength(1)
  answer!: string;
}

export class ManualPromptSchedulingDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  windowStart?: string;

  @IsOptional()
  @IsString()
  windowEnd?: string;

  @IsOptional()
  @IsString()
  minLeadTimeMinutes?: string;
}

export class CreateManualPromptDto {
  @IsString()
  @MinLength(1)
  agentName!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  strategy?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  businessRules?: string;

  @IsOptional()
  @IsString()
  serviceParameters?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualPromptFaqDto)
  faqs?: ManualPromptFaqDto[];

  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;

  @IsOptional()
  @ValidateNested()
  @Type(() => ManualPromptSchedulingDto)
  scheduling?: ManualPromptSchedulingDto;
}

export class UpdateManualPromptDto {
  @IsOptional()
  @IsString()
  agentName?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  strategy?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  businessRules?: string;

  @IsOptional()
  @IsString()
  serviceParameters?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualPromptFaqDto)
  faqs?: ManualPromptFaqDto[];

  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;

  @IsOptional()
  @ValidateNested()
  @Type(() => ManualPromptSchedulingDto)
  scheduling?: ManualPromptSchedulingDto;
}
