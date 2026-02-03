import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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
      limit: query.limit
    });
  }
}
