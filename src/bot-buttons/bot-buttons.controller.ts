import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BotButtonsService, CreateBotButtonDto, UpdateBotButtonDto } from './bot-buttons.service';

type AuthenticatedUser = { userId: string; email: string };

@Controller('bot-buttons')
export class BotButtonsController {
  constructor(private readonly svc: BotButtonsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('active') active?: string) {
    const a = typeof active === 'string' ? active.toLowerCase() === 'true' : undefined;
    return this.svc.list(user.userId, a);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBotButtonDto) {
    return this.svc.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateBotButtonDto) {
    return this.svc.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.userId, id);
  }

  @Post(':id/trigger')
  trigger(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { leadId: string }) {
    return this.svc.trigger(user.userId, id, body.leadId);
  }
}
