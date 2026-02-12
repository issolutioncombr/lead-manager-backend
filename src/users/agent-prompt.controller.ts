import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { assertSuperAdmin } from '../common/super-admin';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentPromptLibraryDto } from './dto/create-agent-prompt-library.dto';
import { SetDestinationPromptAssignmentDto } from './dto/set-destination-prompt-assignment.dto';
import { SetInstanceAgentPromptsDto } from './dto/set-instance-agent-prompts.dto';
import { UpdateAgentPromptLibraryDto } from './dto/update-agent-prompt-library.dto';
import { UpdateAgentPromptDto } from './dto/update-agent-prompt.dto';
import { AgentPromptService } from './agent-prompt.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
};

@Controller('agent-prompt')
export class AgentPromptController {
  constructor(private readonly agentPromptService: AgentPromptService, private readonly prisma: PrismaService) {}

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
    await assertSuperAdmin(this.prisma, user.userId);
    const created = await this.agentPromptService.createPrompt(user.userId, { categoryId: dto.categoryId, name: dto.name ?? null, prompt: dto.prompt });
    return { data: created };
  }

  @Put('prompts/:id')
  async updatePrompt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateAgentPromptLibraryDto) {
    await assertSuperAdmin(this.prisma, user.userId);
    const updated = await this.agentPromptService.updatePrompt(user.userId, id, {
      categoryId: dto.categoryId,
      name: dto.name,
      prompt: dto.prompt,
      active: dto.active
    });
    return { data: updated };
  }

  @Delete('prompts/:id')
  async deletePrompt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await assertSuperAdmin(this.prisma, user.userId);
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

  @Get('instances/:instanceId/destinations/:phoneRaw/assignment')
  async getDestinationAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Param('phoneRaw') phoneRaw: string
  ) {
    return await this.agentPromptService.getDestinationAssignment(user.userId, instanceId, phoneRaw);
  }

  @Put('instances/:instanceId/destinations/:phoneRaw/assignment')
  async setDestinationAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('instanceId') instanceId: string,
    @Param('phoneRaw') phoneRaw: string,
    @Body() dto: SetDestinationPromptAssignmentDto
  ) {
    return await this.agentPromptService.setDestinationAssignment(user.userId, instanceId, phoneRaw, dto.promptId ?? null);
  }

  @Get('reports/dispatches')
  async getDispatchReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('instanceId') instanceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('phoneRaw') phoneRaw?: string
  ) {
    return await this.agentPromptService.getPromptDispatchReport(user.userId, { instanceId, from, to, phoneRaw });
  }

  @Get('reports/dispatches/daily')
  async getDispatchDailyReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('instanceId') instanceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('phoneRaw') phoneRaw?: string,
    @Query('assignedBy') assignedBy?: string
  ) {
    return await this.agentPromptService.getPromptDispatchDailyReport(user.userId, { instanceId, from, to, phoneRaw, assignedBy });
  }
}
