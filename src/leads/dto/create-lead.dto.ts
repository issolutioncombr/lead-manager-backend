import { LeadStage } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsBoolean, IsNumber, IsObject } from 'class-validator';

export class CreateLeadDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  // --- Campos Opcionais para WhatsappMessage e Atribuição Meta CAPI ---

  @IsOptional()
  @IsString()
  wamid?: string;

  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @IsString()
  remoteJid?: string;

  @IsOptional()
  @IsBoolean()
  fromMe?: boolean;

  @IsOptional()
  @IsString()
  pushName?: string; // Mapear do payload "name" se não tiver, ou "pushName" se disponível

  @IsOptional()
  @IsString()
  messageType?: string;

  @IsOptional()
  @IsString()
  messageText?: string; // Mapeado de "messageText" ou "conversation"

  @IsOptional()
  @IsString()
  conversation?: string;

  @IsOptional()
  @IsNumber()
  messageTimestamp?: number;

  @IsOptional()
  @IsNumber()
  senderTimestamp?: number;

  @IsOptional()
  @IsNumber()
  recipientTimestamp?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  deviceSource?: string;

  @IsOptional()
  @IsString()
  instance?: string;

  @IsOptional()
  @IsString()
  instanceId?: string;

  @IsOptional()
  @IsString()
  sender?: string;

  @IsOptional()
  @IsString()
  remoteJidAlt?: string;

  @IsOptional()
  @IsString()
  addressingMode?: string;

  @IsOptional()
  @IsString()
  participant?: string;

  // Atribuição
  @IsOptional()
  @IsString()
  conversionSource?: string;

  @IsOptional()
  @IsString()
  entryPointConversionSource?: string;

  @IsOptional()
  @IsString()
  entryPointConversionApp?: string;

  @IsOptional()
  @IsString()
  entryPointConversionExternalSource?: string;

  @IsOptional()
  @IsString()
  entryPointConversionExternalMedium?: string;

  @IsOptional()
  @IsString()
  ctwaSignals?: string;

  @IsOptional()
  @IsString()
  adSourceType?: string;

  @IsOptional()
  @IsString()
  adSourceId?: string;

  @IsOptional()
  @IsString()
  adSourceUrl?: string;

  @IsOptional()
  @IsString()
  adRef?: string;

  @IsOptional()
  @IsString()
  ctwaClid?: string;

  @IsOptional()
  @IsString()
  sourceApp?: string;

  @IsOptional()
  @IsString()
  adTitle?: string;

  @IsOptional()
  @IsString()
  adBody?: string;

  @IsOptional()
  @IsNumber()
  adMediaType?: number;

  @IsOptional()
  @IsString()
  adThumbnailUrl?: string;

  @IsOptional()
  @IsString()
  adOriginalImageUrl?: string;

  @IsOptional()
  @IsBoolean()
  automatedGreetingMessageShown?: boolean;

  @IsOptional()
  @IsString()
  greetingMessageBody?: string;

  @IsOptional()
  @IsBoolean()
  containsAutoReply?: boolean;

  @IsOptional()
  @IsBoolean()
  renderLargerThumbnail?: boolean;

  @IsOptional()
  @IsBoolean()
  showAdAttribution?: boolean;

  @IsOptional()
  @IsBoolean()
  wtwaAdFormat?: boolean;

  // Raw JSON para segurança
  @IsOptional()
  @IsObject()
  rawJson?: any;

  // Suporte para payload N8N (lowercase)
  @IsOptional()
  rawjson?: any;
}
