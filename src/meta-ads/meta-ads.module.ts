import { Module } from '@nestjs/common';
import { LeadStatusesModule } from '../lead-statuses/lead-statuses.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MetaAdsController } from './meta-ads.controller';
import { MetaAdsService } from './meta-ads.service';

@Module({
  imports: [PrismaModule, LeadStatusesModule],
  controllers: [MetaAdsController],
  providers: [MetaAdsService],
  exports: [MetaAdsService]
})
export class MetaAdsModule {}

