import { Body, Controller, ForbiddenException, Get, Headers, Logger, MessageEvent, Post, Query, Sse } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SellerVideoCallAccessService } from '../sellers/seller-video-call-access.service';
import { EvolutionMessagesService } from './evolution-messages.service';
import { EvolutionSendMessageDto } from './dto/evolution-send-message.dto';
import { EvolutionConversationQueryDto } from './dto/evolution-conversation-query.dto';
import { EvolutionUpdatesQueryDto } from './dto/evolution-updates-query.dto';
import { EvolutionConversationAgentStatusQueryDto, EvolutionConversationAgentStatusSetDto } from './dto/evolution-conversation-agent-status.dto';
import { MessageEventsService } from './message-events.service';
import { catchError, filter, from, interval, map, merge, mergeMap, Observable, of, startWith, throttleTime } from 'rxjs';

type AuthenticatedUser = { userId: string; email: string; sellerId?: string };

@Controller('integrations/evolution/messages')
export class EvolutionMessagesController {
  private readonly logger = new Logger(EvolutionMessagesController.name);
  constructor(
    private readonly svc: EvolutionMessagesService,
    private readonly events: MessageEventsService,
    private readonly access: SellerVideoCallAccessService
  ) {}

  private maskPhone(value: string | undefined | null) {
    const digits = String(value ?? '').replace(/\D+/g, '');
    return digits.length >= 4 ? `${digits.slice(0, 2)}*****${digits.slice(-2)}` : 'invalid';
  }

  private async resolveSellerPhone(user: AuthenticatedUser): Promise<string | null> {
    if (!user.sellerId) return null;
    const scoped = await this.access.getScopedLeadSummaryForSeller(user.userId, user.sellerId);
    const phone = String(scoped.lead?.contact ?? '').replace(/\D+/g, '');
    if (!phone || phone.length < 7) {
      throw new ForbiddenException('Lead vinculado não possui telefone válido');
    }
    return phone;
  }

  @Post('send')
  async send(@CurrentUser() user: AuthenticatedUser, @Body() dto: EvolutionSendMessageDto) {
    const sellerPhone = await this.resolveSellerPhone(user);
    const phone = sellerPhone ? `+${sellerPhone}` : dto.phone;
    return this.svc.sendMessage(user.userId, {
      phone,
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
    const sellerPhone = await this.resolveSellerPhone(user);
    const phone = sellerPhone ? `+${sellerPhone}` : query.phone;
    this.logger.log(
      `conversation userId=${user.userId} phone=${this.maskPhone(phone)} instanceId=${query.instanceId ?? 'auto'} source=${query.source ?? '-'} requestId=${requestId ?? '-'}`
    );
    return this.svc.listConversation(user.userId, phone, {
      direction: query.direction,
      page: query.page,
      limit: query.limit,
      instanceId: query.instanceId,
      remoteJid: sellerPhone ? undefined : query.remoteJid,
      source: sellerPhone ? 'local' : query.source,
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
    if (user.sellerId) {
      const scoped = await this.access.getScopedLeadSummaryForSeller(user.userId, user.sellerId);
      const phone = String(scoped.lead?.contact ?? '').replace(/\D+/g, '');
      const masked = this.maskPhone(phone);
      this.logger.log(`chats(seller) userId=${user.userId} phone=${masked} requestId=${requestId ?? '-'}`);
      const conversation = phone
        ? await this.svc.listConversation(user.userId, `+${phone}`, { limit: 1, source: 'local' })
        : { data: [] };
      const last = Array.isArray((conversation as any)?.data) && (conversation as any).data.length ? (conversation as any).data[(conversation as any).data.length - 1] : null;
      const item = phone
        ? {
            id: phone,
            contact: phone,
            name: scoped.lead?.name ?? null,
            remoteJid: `${phone}@s.whatsapp.net`,
            lastMessage: last
              ? { text: last.mediaUrl ? (last.caption || 'Anexo') : (last.conversation || 'Mensagem'), timestamp: last.timestamp, fromMe: !!last.fromMe }
              : null
          }
        : null;
      return { data: item ? [item] : [] };
    }
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
    if (user.sellerId) {
      const sellerPhone = await this.resolveSellerPhone(user);
      if (sellerPhone) {
        jid = `${sellerPhone}@s.whatsapp.net`;
        phone = sellerPhone;
      }
    }
    const inferredPhone = phone ?? (jid ? jid.split('@')[0] : null);
    this.logger.log(
      `profile-pic userId=${user.userId} phone=${this.maskPhone(inferredPhone)} instanceId=${instanceId ?? 'auto'} requestId=${requestId ?? '-'}`
    );
    const res = await this.svc.getProfilePicUrl(user.userId, { jid: jid || undefined, phone: phone || undefined, instanceId: instanceId || undefined });
    return { profilePicUrl: res };
  }

  @Get('agent-status')
  async getAgentStatus(@CurrentUser() user: AuthenticatedUser, @Query() query: EvolutionConversationAgentStatusQueryDto) {
    if (user.sellerId) {
      const sellerPhone = await this.resolveSellerPhone(user);
      if (sellerPhone && String(query.contact_number ?? '').replace(/\D+/g, '') !== sellerPhone) {
        query.contact_number = sellerPhone;
      }
    }
    const status = await this.svc.getConversationAgentStatus(user.userId, {
      instanceNumber: query.instance_number,
      contactNumber: query.contact_number
    });
    return { status };
  }

  @Post('agent-status')
  async setAgentStatus(@CurrentUser() user: AuthenticatedUser, @Body() dto: EvolutionConversationAgentStatusSetDto) {
    if (user.sellerId) {
      const sellerPhone = await this.resolveSellerPhone(user);
      if (sellerPhone && String(dto.contact_number ?? '').replace(/\D+/g, '') !== sellerPhone) {
        dto.contact_number = sellerPhone;
      }
    }
    const value = dto.value ?? 'ATIVO';
    return this.svc.setConversationAgentStatus(user.userId, {
      instanceNumber: dto.instance_number,
      contactNumber: dto.contact_number,
      value
    });
  }

  @Get('updates')
  async updates(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: EvolutionUpdatesQueryDto
  ) {
    const sellerPhone = await this.resolveSellerPhone(user);
    const phone = sellerPhone ? `+${sellerPhone}` : query.phone;
    this.logger.log(
      `updates userId=${user.userId} phone=${this.maskPhone(phone)} instanceId=${query.instanceId ?? 'auto'} source=${query.source ?? '-'} requestId=${requestId ?? '-'}`
    );
    return this.svc.listUpdates(user.userId, phone, {
      instanceId: query.instanceId,
      source: sellerPhone ? 'local' : query.source,
      limit: query.limit,
      afterTimestamp: query.afterTimestamp,
      afterUpdatedAt: query.afterUpdatedAt
    });
  }

  @Sse('stream')
  async stream(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: EvolutionUpdatesQueryDto
  ): Promise<Observable<MessageEvent>> {
    const sellerPhone = await this.resolveSellerPhone(user);
    const digits = String(sellerPhone ? `+${sellerPhone}` : query.phone ?? '').replace(/\D+/g, '');
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
