
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMetaAdsConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  n8nWebhookUrl?: string | null;

  @IsOptional()
  @IsString()
  accessToken?: string | null;

  @IsOptional()
  @IsString()
  pixelId?: string | null;

  @IsOptional()
  @IsString()
  testEventCode?: string | null;

  @IsOptional()
  @IsString()
  defaultContentName?: string | null;

  @IsOptional()
  @IsString()
  defaultContentCategory?: string | null;
}

export class CreateMetaAdsIntegrationDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  n8nWebhookUrl?: string | null;

  @IsOptional()
  @IsString()
  accessToken?: string | null;

  @IsOptional()
  @IsString()
  pixelId?: string | null;

  @IsOptional()
  @IsString()
  testEventCode?: string | null;

  @IsOptional()
  @IsString()
  defaultContentName?: string | null;

  @IsOptional()
  @IsString()
  defaultContentCategory?: string | null;
}

export class UpdateMetaAdsIntegrationDto extends UpdateMetaAdsConfigDto {}

export class CreateMetaAdsEventDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  metaEventName!: string;
}

export class UpdateMetaAdsEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  metaEventName?: string;
}

export class UpsertMetaAdsMappingDto {
  @IsString()
  @MinLength(1)
  statusSlug!: string;

  @IsString()
  @MinLength(1)
  eventId!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
