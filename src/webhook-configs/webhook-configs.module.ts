import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WebhookConfigsController } from './webhook-configs.controller';
import { WebhookConfigsService } from './webhook-configs.service';

@Module({
  imports: [PrismaModule],
  controllers: [WebhookConfigsController],
  providers: [WebhookConfigsService]
})
export class WebhookConfigsModule {}
