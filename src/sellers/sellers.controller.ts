import { Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Logger, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreateSellerDto } from './dto/create-seller.dto';
import { LinkSellerVideoCallDto } from './dto/link-seller-video-call.dto';
import { UpdateSellerDto } from './dto/update-seller.dto';
import { SellerVideoCallAccessService } from './seller-video-call-access.service';
import { PaginatedSellers } from './sellers.repository';
import { SellersService } from './sellers.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
  sellerId?: string;
};

@Controller('sellers')
export class SellersController {
  private readonly logger = new Logger(SellersController.name);
  constructor(
    private readonly sellersService: SellersService,
    private readonly access: SellerVideoCallAccessService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto): Promise<PaginatedSellers> {
    this.access.ensureCompanyUser(user);
    return this.sellersService.list(user.userId, query);
  }

  @Get('me/video-call-link/active')
  async getMyActiveLink(@CurrentUser() user: AuthenticatedUser) {
    if (!user.sellerId) {
      return { active: false, link: null };
    }
    try {
      const summary = await this.access.getScopedLeadSummaryForSeller(user.userId, user.sellerId);
      return {
        active: true,
        link: {
          sellerId: user.sellerId,
          leadId: summary.leadId,
          appointmentId: summary.appointmentId,
          lead: summary.lead
        }
      };
    } catch {
      return { active: false, link: null };
    }
  }

  @Get(':id')
  find(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    this.access.ensureCompanyUser(user);
    return this.sellersService.findById(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSellerDto) {
    this.access.ensureCompanyUser(user);
    return this.sellersService.create(user.userId, dto);
  }

  @Post(':id/video-call-links')
  async linkVideoCall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sellerId: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() dto: LinkSellerVideoCallDto
  ) {
    this.access.ensureCompanyUser(user);
    const linked = await this.access.linkSellerToVideoCall(user.userId, sellerId, {
      appointmentId: dto.appointmentId,
      leadId: dto.leadId,
      expiresAt: dto.expiresAt
    });
    this.logger.log(
      `seller.video_call.linked userId=${user.userId} sellerId=${sellerId} leadId=${linked.leadId ?? '-'} appointmentId=${linked.appointmentId ?? '-'} requestId=${requestId ?? '-'}`
    );
    return linked;
  }

  @Get(':id/video-call-links/active')
  async getSellerActiveLink(@CurrentUser() user: AuthenticatedUser, @Param('id') sellerId: string) {
    if (user.sellerId) {
      if (user.sellerId !== sellerId) throw new ForbiddenException('Acesso negado');
    } else {
      this.access.ensureCompanyUser(user);
    }
    const link = await this.access.getActiveLinkForSeller(user.userId, sellerId);
    return { active: !!link, link };
  }

  @Delete(':id/video-call-links/:linkId')
  @HttpCode(204)
  async revokeVideoCallLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sellerId: string,
    @Param('linkId') linkId: string,
    @Headers('x-request-id') requestId: string | undefined
  ) {
    this.access.ensureCompanyUser(user);
    const revoked = await this.access.revokeLink(user.userId, sellerId, linkId);
    this.logger.log(
      `seller.video_call.revoked userId=${user.userId} sellerId=${sellerId} leadId=${revoked.leadId ?? '-'} appointmentId=${revoked.appointmentId ?? '-'} requestId=${requestId ?? '-'}`
    );
    return;
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSellerDto) {
    this.access.ensureCompanyUser(user);
    return this.sellersService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    this.access.ensureCompanyUser(user);
    return this.sellersService.delete(user.userId, id);
  }
}
