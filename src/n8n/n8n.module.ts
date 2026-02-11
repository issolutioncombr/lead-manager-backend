import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { N8nController } from './n8n.controller';

@Module({
  imports: [PrismaModule],
  controllers: [N8nController]
})
export class N8nModule {}

