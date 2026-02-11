import { Module } from '@nestjs/common';

import { LeadStatusesModule } from '../lead-statuses/lead-statuses.module';
import { MetaAdsModule } from '../meta-ads/meta-ads.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SellersModule } from '../sellers/sellers.module';
import { LeadsController } from './leads.controller';
import { LeadsRepository } from './leads.repository';
import { LeadsService } from './leads.service';
import { LeadStatusWebhookService } from './lead-status-webhook.service';

@Module({
  imports: [PrismaModule, SellersModule, LeadStatusesModule, MetaAdsModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadsRepository, LeadStatusWebhookService],
  exports: [LeadsService]
})
export class LeadsModule {}
