import { Body, Controller, Get, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateAgentPromptDto } from './dto/update-agent-prompt.dto';
import { AgentPromptService } from './agent-prompt.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
};

@Controller('agent-prompt')
export class AgentPromptController {
  constructor(private readonly agentPromptService: AgentPromptService) {}

  @Get()
  async getAgentPrompt(@CurrentUser() user: AuthenticatedUser, @Query('instanceId') instanceId?: string) {
    const prompt = instanceId
      ? await this.agentPromptService.getPromptForInstance(user.userId, instanceId)
      : await this.agentPromptService.getPrompt(user.userId);
    return { prompt };
  }

  @Put()
  async updateAgentPrompt(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAgentPromptDto,
    @Query('instanceId') instanceId?: string
  ) {
    const prompt = instanceId
      ? await this.agentPromptService.updatePromptForInstance(user.userId, instanceId, dto.prompt ?? '')
      : await this.agentPromptService.updatePrompt(user.userId, dto.prompt ?? '');
    return { prompt };
  }
}
