import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreateSellerDto } from './dto/create-seller.dto';
import { UpdateSellerDto } from './dto/update-seller.dto';
import { PaginatedSellers } from './sellers.repository';
import { SellersService } from './sellers.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
};

@Controller('sellers')
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto): Promise<PaginatedSellers> {
    return this.sellersService.list(user.userId, query);
  }

  @Get(':id')
  find(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sellersService.findById(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSellerDto) {
    return this.sellersService.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSellerDto) {
    return this.sellersService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sellersService.delete(user.userId, id);
  }
}
