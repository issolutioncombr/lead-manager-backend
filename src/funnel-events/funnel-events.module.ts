import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { FunnelEventsService } from './funnel-events.service';

@Module({
  imports: [PrismaModule],
  providers: [FunnelEventsService],
  exports: [FunnelEventsService]
})
export class FunnelEventsModule {}
