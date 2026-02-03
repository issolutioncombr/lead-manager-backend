import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WebhookConfigsService, CreateWebhookConfigDto, UpdateWebhookConfigDto } from './webhook-configs.service';

type AuthenticatedUser = { userId: string; email: string };

@Controller('webhook-configs')
export class WebhookConfigsController {
  constructor(private readonly svc: WebhookConfigsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('origin') origin?: string) {
    return this.svc.list(user.userId, origin || undefined);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWebhookConfigDto) {
    return this.svc.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateWebhookConfigDto) {
    return this.svc.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.userId, id);
  }
}
