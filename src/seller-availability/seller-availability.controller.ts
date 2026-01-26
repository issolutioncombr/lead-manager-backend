import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSellerAvailabilityDto } from './dto/create-seller-availability.dto';
import { UpdateSellerAvailabilityDto } from './dto/update-seller-availability.dto';
import { SellerAvailabilityService } from './seller-availability.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
  sellerId?: string;
};

@Controller('seller-availability')
export class SellerAvailabilityController {
  constructor(private readonly sellerAvailabilityService: SellerAvailabilityService) {}

  @Get('overview')
  listByCompany(@CurrentUser() user: AuthenticatedUser) {
    if (user.sellerId) {
      throw new BadRequestException('Somente empresas podem acessar esta funcionalidade');
    }
    return this.sellerAvailabilityService.listSlotsByUser(user.userId);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    const sellerId = this.extractSellerId(user);
    return this.sellerAvailabilityService.listSlots(sellerId);
  }

  @Get('manage/:sellerId')
  listForCompany(@CurrentUser() user: AuthenticatedUser, @Param('sellerId') sellerId: string) {
    this.ensureCompanyUser(user);
    return this.sellerAvailabilityService.listSlots(sellerId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSellerAvailabilityDto) {
    const sellerId = this.extractSellerId(user);
    return this.sellerAvailabilityService.createSlot(sellerId, dto);
  }

  @Post('manage/:sellerId')
  createForCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sellerId') sellerId: string,
    @Body() dto: CreateSellerAvailabilityDto
  ) {
    this.ensureCompanyUser(user);
    return this.sellerAvailabilityService.createSlot(sellerId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') slotId: string,
    @Body() dto: UpdateSellerAvailabilityDto
  ) {
    const sellerId = this.extractSellerId(user);
    return this.sellerAvailabilityService.updateSlot(sellerId, slotId, dto);
  }

  @Patch('manage/:sellerId/:id')
  updateForCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sellerId') sellerId: string,
    @Param('id') slotId: string,
    @Body() dto: UpdateSellerAvailabilityDto
  ) {
    this.ensureCompanyUser(user);
    return this.sellerAvailabilityService.updateSlot(sellerId, slotId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') slotId: string) {
    const sellerId = this.extractSellerId(user);
    return this.sellerAvailabilityService.deleteSlot(sellerId, slotId);
  }

  @Delete('manage/:sellerId/:id')
  removeForCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sellerId') sellerId: string,
    @Param('id') slotId: string
  ) {
    this.ensureCompanyUser(user);
    return this.sellerAvailabilityService.deleteSlot(sellerId, slotId);
  }

  private extractSellerId(user: AuthenticatedUser): string {
    if (!user.sellerId) {
      throw new BadRequestException('Somente vendedores podem acessar esta funcionalidade');
    }

    return user.sellerId;
  }

  private ensureCompanyUser(user: AuthenticatedUser): void {
    if (user.sellerId) {
      throw new BadRequestException('Somente empresas podem acessar esta funcionalidade');
    }
  }
}
