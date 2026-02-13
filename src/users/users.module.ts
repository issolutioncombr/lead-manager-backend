import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AgentPromptController } from './agent-prompt.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { AgentPromptService } from './agent-prompt.service';
import { UsersController } from './users.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AgentPromptController, UsersController],
  providers: [UsersService, UsersRepository, AgentPromptService],
  exports: [UsersService, AgentPromptService]
})
export class UsersModule {}
