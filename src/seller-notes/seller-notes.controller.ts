import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSellerCallNoteDto } from './dto/create-seller-call-note.dto';
import { ListSellerCallNotesDto } from './dto/list-seller-call-notes.dto';
import { UpdateSellerCallNoteDto } from './dto/update-seller-call-note.dto';
import { SellerNotesService } from './seller-notes.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
  sellerId?: string;
};

@Controller('seller-notes')
export class SellerNotesController {
  constructor(private readonly sellerNotesService: SellerNotesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListSellerCallNotesDto) {
    return this.sellerNotesService.list(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSellerCallNoteDto) {
    return this.sellerNotesService.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSellerCallNoteDto) {
    return this.sellerNotesService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.sellerNotesService.remove(user, id);
    return;
  }
}

