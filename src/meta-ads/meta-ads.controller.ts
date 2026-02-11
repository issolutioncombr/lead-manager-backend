import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { MetaAdsService } from './meta-ads.service';
import {
  CreateMetaAdsEventDto,
  CreateMetaAdsIntegrationDto,
  UpdateMetaAdsConfigDto,
  UpdateMetaAdsEventDto,
  UpdateMetaAdsIntegrationDto,
  UpsertMetaAdsMappingDto
} from './dto/update-meta-ads-config.dto';

@Controller('integrations/meta-ads')
export class MetaAdsController {
  constructor(private readonly service: MetaAdsService) {}

  @Get()
  get(@Req() req: any, @Query('integrationId') integrationId?: string) {
    return this.service.getConfig(req.user.userId, integrationId);
  }

  @Patch()
  update(@Req() req: any, @Query('integrationId') integrationId: string | undefined, @Body() dto: UpdateMetaAdsConfigDto) {
    return this.service.updateConfig(req.user.userId, integrationId, dto);
  }

  @Get('integrations')
  listIntegrations(@Req() req: any) {
    return this.service.listIntegrations(req.user.userId);
  }

  @Post('integrations')
  createIntegration(@Req() req: any, @Body() dto: CreateMetaAdsIntegrationDto) {
    return this.service.createIntegration(req.user.userId, dto);
  }

  @Patch('integrations/:id')
  updateIntegration(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateMetaAdsIntegrationDto) {
    return this.service.updateIntegration(req.user.userId, id, dto);
  }

  @Delete('integrations/:id')
  removeIntegration(@Req() req: any, @Param('id') id: string) {
    return this.service.removeIntegration(req.user.userId, id);
  }

  @Post('events')
  createEvent(@Req() req: any, @Query('integrationId') integrationId: string | undefined, @Body() dto: CreateMetaAdsEventDto) {
    return this.service.createEvent(req.user.userId, integrationId, dto);
  }

  @Patch('events/:id')
  updateEvent(
    @Req() req: any,
    @Query('integrationId') integrationId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateMetaAdsEventDto
  ) {
    return this.service.updateEvent(req.user.userId, integrationId, id, dto);
  }

  @Delete('events/:id')
  removeEvent(@Req() req: any, @Query('integrationId') integrationId: string | undefined, @Param('id') id: string) {
    return this.service.removeEvent(req.user.userId, integrationId, id);
  }

  @Post('mappings')
  upsertMappings(
    @Req() req: any,
    @Query('integrationId') integrationId: string | undefined,
    @Body() body: { items: UpsertMetaAdsMappingDto[] }
  ) {
    return this.service.upsertMappings(req.user.userId, integrationId, Array.isArray(body?.items) ? body.items : []);
  }
}
