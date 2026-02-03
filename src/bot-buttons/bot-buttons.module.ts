import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BotButtonsController } from './bot-buttons.controller';
import { BotButtonsService } from './bot-buttons.service';

@Module({
  imports: [PrismaModule],
  controllers: [BotButtonsController],
  providers: [BotButtonsService]
})
export class BotButtonsModule {}
