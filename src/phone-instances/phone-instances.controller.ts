import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PhoneInstancesService } from './phone-instances.service';
import { BotActionDto } from './dto/bot-action.dto';

type AuthenticatedUser = { userId: string; email: string };

@Controller('phone-instances')
export class PhoneInstancesController {
  constructor(private readonly svc: PhoneInstancesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.userId);
  }

  @Post(':id/bot/action')
  perform(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: BotActionDto
  ) {
    return this.svc.performAction(user.userId, id, dto.action, user.userId);
  }

  @Get(':id/bot/logs')
  logs(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.logs(user.userId, id);
  }

  @Patch(':id')
  linkWebhook(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { botWebhookConfigId: string | null }
  ) {
    return this.svc.linkWebhookConfig(user.userId, id, body?.botWebhookConfigId ?? null);
  }
}
