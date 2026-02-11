import { Body, Controller, Get, Headers, Logger, MessageEvent, Post, Query, Sse } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EvolutionMessagesService } from './evolution-messages.service';
import { EvolutionSendMessageDto } from './dto/evolution-send-message.dto';
import { EvolutionConversationQueryDto } from './dto/evolution-conversation-query.dto';
import { EvolutionUpdatesQueryDto } from './dto/evolution-updates-query.dto';
import { MessageEventsService } from './message-events.service';
import { catchError, filter, from, interval, map, merge, mergeMap, Observable, of, startWith, throttleTime } from 'rxjs';

type AuthenticatedUser = { userId: string; email: string };

@Controller('integrations/evolution/messages')
export class EvolutionMessagesController {
  private readonly logger = new Logger(EvolutionMessagesController.name);
  constructor(
    private readonly svc: EvolutionMessagesService,
    private readonly events: MessageEventsService
  ) {}

  private maskPhone(value: string | undefined | null) {
    const digits = String(value ?? '').replace(/\D+/g, '');
    return digits.length >= 4 ? `${digits.slice(0, 2)}*****${digits.slice(-2)}` : 'invalid';
  }

  @Post('send')
  async send(@CurrentUser() user: AuthenticatedUser, @Body() dto: EvolutionSendMessageDto) {
    return this.svc.sendMessage(user.userId, {
      phone: dto.phone,
      text: dto.text,
      mediaUrl: dto.mediaUrl,
      caption: dto.caption,
      clientMessageId: dto.clientMessageId,
      instanceId: dto.instanceId
    });
  }

  @Get('conversation')
  async conversation(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: EvolutionConversationQueryDto
  ) {
    this.logger.log(
      `conversation userId=${user.userId} phone=${this.maskPhone(query.phone)} instanceId=${query.instanceId ?? 'auto'} source=${query.source ?? '-'} requestId=${requestId ?? '-'}`
    );
    return this.svc.listConversation(user.userId, query.phone, {
      direction: query.direction,
      page: query.page,
      limit: query.limit,
      instanceId: query.instanceId,
      remoteJid: query.remoteJid,
      source: query.source,
      beforeTimestamp: query.beforeTimestamp,
      beforeUpdatedAt: query.beforeUpdatedAt,
      cursor: query.cursor
    });
  }

  @Get('chats')
  async chats(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId: string | undefined,
    @Query('instanceId') instanceId?: string,
    @Query('limit') limit?: string,
    @Query('source') source?: 'provider' | 'local'
  ) {
    this.logger.log(
      `chats userId=${user.userId} instanceId=${instanceId ?? 'auto'} source=${source ?? '-'} requestId=${requestId ?? '-'}`
    );
    const data = await this.svc.listChats(user.userId, { instanceId: instanceId || undefined, limit: limit ? parseInt(limit, 10) || 100 : 100, source });
    return { data };
  }

  @Get('profile-pic')
  async profilePic(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId: string | undefined,
    @Query('jid') jid?: string,
    @Query('phone') phone?: string,
    @Query('instanceId') instanceId?: string
  ) {
    const inferredPhone = phone ?? (jid ? jid.split('@')[0] : null);
    this.logger.log(
      `profile-pic userId=${user.userId} phone=${this.maskPhone(inferredPhone)} instanceId=${instanceId ?? 'auto'} requestId=${requestId ?? '-'}`
    );
    const res = await this.svc.getProfilePicUrl(user.userId, { jid: jid || undefined, phone: phone || undefined, instanceId: instanceId || undefined });
    return { profilePicUrl: res };
  }

  @Get('updates')
  async updates(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: EvolutionUpdatesQueryDto
  ) {
    this.logger.log(
      `updates userId=${user.userId} phone=${this.maskPhone(query.phone)} instanceId=${query.instanceId ?? 'auto'} source=${query.source ?? '-'} requestId=${requestId ?? '-'}`
    );
    return this.svc.listUpdates(user.userId, query.phone, {
      instanceId: query.instanceId,
      source: query.source,
      limit: query.limit,
      afterTimestamp: query.afterTimestamp,
      afterUpdatedAt: query.afterUpdatedAt
    });
  }

  @Sse('stream')
  stream(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: EvolutionUpdatesQueryDto
  ): Observable<MessageEvent> {
    const digits = String(query.phone ?? '').replace(/\D+/g, '');
    const masked = digits.length >= 4 ? `${digits.slice(0, 2)}*****${digits.slice(-2)}` : 'invalid';
    this.logger.log(`stream start userId=${user.userId} phone=${masked} requestId=${requestId ?? '-'}`);
    let cursor = {
      lastTimestamp: query.afterTimestamp ?? new Date(0).toISOString(),
      lastUpdatedAt: query.afterUpdatedAt ?? new Date(0).toISOString()
    };
    const keepalive$ = interval(15_000).pipe(map(() => ({ type: 'keepalive', data: { ts: new Date().toISOString() } } satisfies MessageEvent)));
    const trigger$ = this.events
      .on()
      .pipe(
        filter((e) => e.userId === user.userId && e.phoneRaw === digits),
        startWith({ userId: user.userId, phoneRaw: digits, event: 'messages.send' }),
        throttleTime(250, undefined, { leading: true, trailing: true })
      );
    const messages$ = trigger$.pipe(
      mergeMap(async () => {
        const res = await this.svc.listUpdates(user.userId, `+${digits}`, {
          instanceId: query.instanceId,
          source: 'local',
          limit: query.limit ?? 200,
          afterTimestamp: cursor.lastTimestamp,
          afterUpdatedAt: cursor.lastUpdatedAt
        });
        cursor = res.cursor;
        return res.data ?? [];
      }),
      mergeMap((items: any[]) => (Array.isArray(items) ? from(items).pipe(map((m) => ({ type: 'message', data: m } satisfies MessageEvent))) : of())),
      catchError(() => {
        this.logger.warn(`stream error userId=${user.userId} phone=${masked} requestId=${requestId ?? '-'}`);
        return of({ type: 'error', data: { message: 'stream_error' } } satisfies MessageEvent);
      })
    );
    return merge(messages$, keepalive$);
  }

}
