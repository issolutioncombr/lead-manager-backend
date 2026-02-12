import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PromptCategoriesController } from './prompt-categories.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PromptCategoriesController]
})
export class PromptCategoriesModule {}

