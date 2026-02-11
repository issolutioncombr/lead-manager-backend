import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SellerRemindersController } from './seller-reminders.controller';
import { SellerRemindersService } from './seller-reminders.service';

@Module({
  imports: [PrismaModule],
  controllers: [SellerRemindersController],
  providers: [SellerRemindersService]
})
export class SellerRemindersModule {}

