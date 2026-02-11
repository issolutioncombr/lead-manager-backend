import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadStatusesController } from './lead-statuses.controller';
import { LeadStatusesService } from './lead-statuses.service';

@Module({
  imports: [PrismaModule],
  controllers: [LeadStatusesController],
  providers: [LeadStatusesService],
  exports: [LeadStatusesService]
})
export class LeadStatusesModule {}

