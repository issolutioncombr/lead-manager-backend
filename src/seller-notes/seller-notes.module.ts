import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SellerNotesController } from './seller-notes.controller';
import { SellerNotesService } from './seller-notes.service';

@Module({
  imports: [PrismaModule],
  controllers: [SellerNotesController],
  providers: [SellerNotesService]
})
export class SellerNotesModule {}

