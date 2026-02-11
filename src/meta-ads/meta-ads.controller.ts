import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { MetaAdsService } from './meta-ads.service';
import { CreateMetaAdsEventDto, UpdateMetaAdsConfigDto, UpdateMetaAdsEventDto, UpsertMetaAdsMappingDto } from './dto/update-meta-ads-config.dto';

@Controller('integrations/meta-ads')
export class MetaAdsController {
  constructor(private readonly service: MetaAdsService) {}

  @Get()
  get(@Req() req: any) {
    return this.service.getConfig(req.user.userId);
  }

  @Patch()
  update(@Req() req: any, @Body() dto: UpdateMetaAdsConfigDto) {
    return this.service.updateConfig(req.user.userId, dto);
  }

  @Post('events')
  createEvent(@Req() req: any, @Body() dto: CreateMetaAdsEventDto) {
    return this.service.createEvent(req.user.userId, dto);
  }

  @Patch('events/:id')
  updateEvent(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateMetaAdsEventDto) {
    return this.service.updateEvent(req.user.userId, id, dto);
  }

  @Delete('events/:id')
  removeEvent(@Req() req: any, @Param('id') id: string) {
    return this.service.removeEvent(req.user.userId, id);
  }

  @Post('mappings')
  upsertMappings(@Req() req: any, @Body() body: { items: UpsertMetaAdsMappingDto[] }) {
    return this.service.upsertMappings(req.user.userId, Array.isArray(body?.items) ? body.items : []);
  }
}

