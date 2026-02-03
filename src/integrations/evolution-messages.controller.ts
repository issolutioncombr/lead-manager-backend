import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query, UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EvolutionMessagesService } from './evolution-messages.service';
import { EvolutionSendMessageDto } from './dto/evolution-send-message.dto';
import { EvolutionConversationQueryDto } from './dto/evolution-conversation-query.dto';

type AuthenticatedUser = { userId: string; email: string };

@Controller('integrations/evolution/messages')
export class EvolutionMessagesController {
  constructor(private readonly svc: EvolutionMessagesService) {}

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
    @Query() query: EvolutionConversationQueryDto
  ) {
    return this.svc.listConversation(user.userId, query.phone, {
      direction: query.direction,
      page: query.page,
      limit: query.limit,
      instanceId: query.instanceId
    });
  }

  @Get('chats')
  async chats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('instanceId') instanceId?: string,
    @Query('limit') limit?: string
  ) {
    const data = await this.svc.listChats(user.userId, { instanceId: instanceId || undefined, limit: limit ? parseInt(limit, 10) || 100 : 100 });
    return { data };
  }

  @Get('public-conversation')
  @HttpCode(HttpStatus.OK)
  async publicConversation(
    @Headers('x-evolution-webhook-token') tokenHeader: string | undefined,
    @Query('phone') phone: string,
    @Query('limit') limit?: string
  ) {
    const expected = process.env.EVOLUTION_WEBHOOK_TOKEN;
    if (expected && tokenHeader !== expected) {
      throw new UnauthorizedException();
    }
    const lim = limit ? parseInt(limit, 10) || 50 : 50;
    return this.svc.listConversationPublic(phone, { limit: lim });
  }
}
