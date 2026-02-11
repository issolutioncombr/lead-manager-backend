import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ManualPromptsController } from './manual-prompts.controller';
import { ManualPromptsService } from './manual-prompts.service';

@Module({
  imports: [PrismaModule],
  controllers: [ManualPromptsController],
  providers: [ManualPromptsService]
})
export class ManualPromptsModule {}

