import { Body, Controller, Get, Put } from '@nestjs/common';

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
  async getAgentPrompt(@CurrentUser() user: AuthenticatedUser) {
    const prompt = await this.agentPromptService.getPrompt(user.userId);
    return { prompt };
  }

  @Put()
  async updateAgentPrompt(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAgentPromptDto
  ) {
    const prompt = await this.agentPromptService.updatePrompt(user.userId, dto.prompt ?? '');
    return { prompt };
  }
}
