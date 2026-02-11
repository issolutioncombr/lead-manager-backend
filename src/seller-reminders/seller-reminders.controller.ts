import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSellerReminderDto } from './dto/create-seller-reminder.dto';
import { ListSellerRemindersDto } from './dto/list-seller-reminders.dto';
import { ListSellerRemindersOverviewDto } from './dto/list-seller-reminders-overview.dto';
import { UpdateSellerReminderDto } from './dto/update-seller-reminder.dto';
import { SellerRemindersService } from './seller-reminders.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
  sellerId?: string;
};

@Controller('seller-reminders')
export class SellerRemindersController {
  constructor(private readonly sellerRemindersService: SellerRemindersService) {}

  @Get('overview')
  listByCompany(@CurrentUser() user: AuthenticatedUser, @Query() query: ListSellerRemindersOverviewDto) {
    return this.sellerRemindersService.listByCompany(user, query);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListSellerRemindersDto) {
    return this.sellerRemindersService.list(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSellerReminderDto) {
    return this.sellerRemindersService.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSellerReminderDto) {
    return this.sellerRemindersService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.sellerRemindersService.remove(user, id);
    return;
  }
}
