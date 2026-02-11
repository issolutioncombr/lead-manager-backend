import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SellersController } from './sellers.controller';
import { SellersRepository } from './sellers.repository';
import { SellersService } from './sellers.service';
import { SellerVideoCallAccessService } from './seller-video-call-access.service';

@Module({
  imports: [PrismaModule],
  controllers: [SellersController],
  providers: [SellersService, SellersRepository, SellerVideoCallAccessService],
  exports: [SellersService, SellerVideoCallAccessService]
})
export class SellersModule {}
