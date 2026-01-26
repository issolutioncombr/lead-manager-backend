import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GoogleCalendarService } from './google-calendar.service';
import {
  GoogleCalendarCreateEventDto,
  GoogleCalendarDeleteEventDto,
  GoogleCalendarGetEventQueryDto,
  GoogleCalendarListEventsDto,
  GoogleCalendarUpdateEventDto
} from './dto/google-calendar-event.dto';

type AuthenticatedUser = {
  userId: string;
  email: string;
};

/**
 * Controller responsável por expor endpoints REST para operar o Google Calendar via backend.
 * Cada rota usa o usuário autenticado (JWT) e delega as chamadas ao GoogleCalendarService.
 */
@Controller('google/calendar')
export class GoogleCalendarController {
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  /**
   * Lista eventos do calendário informado usando os mesmos filtros da API do Google.
   */
  @Get('events')
  async listEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GoogleCalendarListEventsDto
  ) {
    return this.googleCalendarService.listEvents(user.userId, {
      calendarId: query.calendarId,
      timeMin: query.timeMin,
      timeMax: query.timeMax,
      pageToken: query.pageToken,
      syncToken: query.syncToken,
      singleEvents: true,
      orderBy: 'startTime'
    });
  }

  /**
   * Recupera os dados de um evento específico.
   */
  @Get('events/:eventId')
  async getEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Query() query: GoogleCalendarGetEventQueryDto
  ) {
    return this.googleCalendarService.getEvent(user.userId, {
      calendarId: query.calendarId,
      eventId
    });
  }

  /**
   * Cria um novo evento no calendário do usuário.
   */
  @Post('events')
  async createEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GoogleCalendarCreateEventDto
  ) {
    const defaultTz = process.env.APP_TIMEZONE ?? process.env.TZ ?? 'America/Sao_Paulo';
    const withTz = (dt?: { dateTime?: string; timeZone?: string }) =>
      dt ? { ...dt, timeZone: dt.timeZone ?? defaultTz } : undefined;
    const conferenceData = dto.createMeetLink
      ? {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      : undefined;

    return this.googleCalendarService.insertEvent(user.userId, {
      calendarId: dto.calendarId,
      conferenceDataVersion: conferenceData ? 1 : undefined,
      requestBody: {
        start: withTz(dto.start),
        end: withTz(dto.end),
        summary: dto.summary,
        description: dto.description,
        attendees: dto.attendees,
        location: dto.location,
        conferenceData
      }
    });
  }

  /**
   * Atualiza parcialmente um evento já existente.
   */
  @Patch('events/:eventId')
  async updateEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Body() dto: GoogleCalendarUpdateEventDto
  ) {
    const defaultTz = process.env.APP_TIMEZONE ?? process.env.TZ ?? 'America/Sao_Paulo';
    const withTz = (dt?: { dateTime?: string; timeZone?: string }) =>
      dt ? { ...dt, timeZone: dt.timeZone ?? defaultTz } : undefined;
    const conferenceData = dto.createMeetLink
      ? {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      : undefined;

    return this.googleCalendarService.patchEvent(user.userId, {
      calendarId: dto.calendarId,
      eventId,
      conferenceDataVersion: conferenceData ? 1 : undefined,
      requestBody: {
        start: withTz(dto.start),
        end: withTz(dto.end),
        summary: dto.summary,
        description: dto.description,
        attendees: dto.attendees,
        location: dto.location,
        conferenceData
      }
    });
  }

  /**
   * Remove um evento do calendário do usuário.
   */
  @Delete('events/:eventId')
  async deleteEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Body() dto: GoogleCalendarDeleteEventDto
  ) {
    await this.googleCalendarService.deleteEvent(user.userId, {
      calendarId: dto.calendarId,
      eventId
    });

    return {
      message: 'Evento removido com sucesso.'
    };
  }
}
