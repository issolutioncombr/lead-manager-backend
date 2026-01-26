import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested
} from 'class-validator';

/**
 * Estrutura de data/hora utilizada pela API do Google Calendar.
 */
class GoogleCalendarDateTimeDto {
  @IsNotEmpty()
  @IsDateString()
  dateTime!: string;

  @IsOptional()
  @IsString()
  timeZone?: string;
}

/**
 * Representa um participante do evento (apenas e-mail e nome exibido).
 */
class GoogleCalendarAttendeeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

/**
 * Payload aceito ao criar um evento via endpoint interno.
 */
export class GoogleCalendarCreateEventDto {
  @IsNotEmpty()
  @IsString()
  calendarId!: string;

  @ValidateNested()
  @Type(() => GoogleCalendarDateTimeDto)
  start!: GoogleCalendarDateTimeDto;

  @ValidateNested()
  @Type(() => GoogleCalendarDateTimeDto)
  end!: GoogleCalendarDateTimeDto;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GoogleCalendarAttendeeDto)
  attendees?: GoogleCalendarAttendeeDto[];

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsBoolean()
  createMeetLink?: boolean;
}

/**
 * Payload aceito ao atualizar (patch) um evento.
 */
export class GoogleCalendarUpdateEventDto {
  @IsNotEmpty()
  @IsString()
  calendarId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GoogleCalendarDateTimeDto)
  start?: GoogleCalendarDateTimeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GoogleCalendarDateTimeDto)
  end?: GoogleCalendarDateTimeDto;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoogleCalendarAttendeeDto)
  attendees?: GoogleCalendarAttendeeDto[];

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsBoolean()
  createMeetLink?: boolean;
}

/**
 * Parâmetros de listagem de eventos (query string).
 */
export class GoogleCalendarListEventsDto {
  @IsNotEmpty()
  @IsString()
  calendarId!: string;

  @IsOptional()
  @IsDateString()
  timeMin?: string;

  @IsOptional()
  @IsDateString()
  timeMax?: string;

  @IsOptional()
  @IsString()
  pageToken?: string;

  @IsOptional()
  @IsString()
  syncToken?: string;
}

/**
 * Query para buscar um único evento (via path param + calendário).
 */
export class GoogleCalendarGetEventQueryDto {
  @IsNotEmpty()
  @IsString()
  calendarId!: string;
}

/**
 * Corpo enviado ao remover um evento (necessário informar o calendário).
 */
export class GoogleCalendarDeleteEventDto {
  @IsNotEmpty()
  @IsString()
  calendarId!: string;
}
