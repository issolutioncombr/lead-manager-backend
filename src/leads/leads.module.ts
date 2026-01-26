import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { LeadsController } from './leads.controller';
import { LeadsRepository } from './leads.repository';
import { LeadsService } from './leads.service';
import { LeadStatusWebhookService } from './lead-status-webhook.service';

@Module({
  imports: [PrismaModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadsRepository, LeadStatusWebhookService],
  exports: [LeadsService]
})
export class LeadsModule {}
