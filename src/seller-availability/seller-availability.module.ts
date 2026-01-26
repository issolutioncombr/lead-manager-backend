import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SellerAvailabilityController } from './seller-availability.controller';
import { SellerAvailabilityService } from './seller-availability.service';

@Module({
  imports: [PrismaModule],
  controllers: [SellerAvailabilityController],
  providers: [SellerAvailabilityService]
})
export class SellerAvailabilityModule {}
