import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AgentPromptController } from './agent-prompt.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { AgentPromptService } from './agent-prompt.service';

@Module({
  imports: [PrismaModule],
  controllers: [AgentPromptController],
  providers: [UsersService, UsersRepository, AgentPromptService],
  exports: [UsersService]
})
export class UsersModule {}
