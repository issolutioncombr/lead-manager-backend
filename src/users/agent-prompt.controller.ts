import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateAgentPromptLibraryDto } from 'src/users/dto/create-agent-prompt-library.dto';
import { SetInstanceAgentPromptsDto } from 'src/users/dto/set-instance-agent-prompts.dto';
import { UpdateAgentPromptLibraryDto } from 'src/users/dto/update-agent-prompt-library.dto';
import { UpdateAgentPromptDto } from 'src/users/dto/update-agent-prompt.dto';
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
      ? await this.agentPromptService.getLegacyPromptForInstance(user.userId, instanceId)
      : await this.agentPromptService.getLegacyPrompt(user.userId);
    return { prompt };
  }

  @Put()
  async updateAgentPrompt(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAgentPromptDto,
    @Query('instanceId') instanceId?: string
  ) {
    const prompt = instanceId
      ? await this.agentPromptService.updateLegacyPromptForInstance(user.userId, instanceId, dto.prompt ?? '')
      : await this.agentPromptService.updateLegacyPrompt(user.userId, dto.prompt ?? '');
    return { prompt };
  }

  @Get('prompts')
  async listPrompts(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.agentPromptService.listPrompts(user.userId);
    return { data };
  }

  @Post('prompts')
  async createPrompt(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAgentPromptLibraryDto) {
    const created = await this.agentPromptService.createPrompt(user.userId, { name: dto.name ?? null, prompt: dto.prompt });
    return { data: created };
  }

  @Put('prompts/:id')
  async updatePrompt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateAgentPromptLibraryDto) {
    const updated = await this.agentPromptService.updatePrompt(user.userId, id, {
      name: dto.name,
      prompt: dto.prompt,
      active: dto.active
    });
    return { data: updated };
  }

  @Delete('prompts/:id')
  async deletePrompt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return await this.agentPromptService.deletePrompt(user.userId, id);
  }

  @Get('instances/:instanceId/prompts')
  async getInstancePrompts(@CurrentUser() user: AuthenticatedUser, @Param('instanceId') instanceId: string) {
    return await this.agentPromptService.listInstancePromptLinks(user.userId, instanceId);
  }

  @Put('instances/:instanceId/prompts')
  async putInstancePrompts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Body() dto: SetInstanceAgentPromptsDto
  ) {
    return await this.agentPromptService.setInstancePromptLinks(user.userId, instanceId, dto.items ?? []);
  }
}
