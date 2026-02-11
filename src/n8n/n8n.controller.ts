import { Controller, Get, Headers, NotFoundException, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('n8n')
export class N8nController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('agent-prompts/:id')
  async getAgentPrompt(
    @Param('id') id: string,
    @Headers('x-n8n-token') n8nTokenHeader?: string,
    @Headers('x-api-key') apiKeyHeader?: string,
    @Query('api_key') apiKeyQuery?: string
  ) {
    const expectedToken = String(process.env.N8N_API_TOKEN ?? '').trim();
    if (expectedToken) {
      const receivedToken = String(n8nTokenHeader ?? '').trim();
      if (!receivedToken || expectedToken !== receivedToken) {
        throw new NotFoundException();
      }
    }

    const apiKey = String(apiKeyHeader ?? apiKeyQuery ?? '').trim();
    if (!apiKey) throw new NotFoundException();

    const user = await this.prisma.user.findUnique({ where: { apiKey }, select: { id: true } });
    if (!user?.id) throw new NotFoundException();

    const promptId = String(id ?? '').trim();
    if (!promptId) throw new NotFoundException();

    const agentPrompt = await (this.prisma as any).agentPrompt.findFirst({
      where: { id: promptId, userId: user.id, active: true },
      select: {
        id: true,
        userId: true,
        name: true,
        prompt: true,
        promptType: true,
        version: true,
        manualConfig: true,
        updatedAt: true
      }
    });
    if (!agentPrompt) throw new NotFoundException();

    const manualConfig = agentPrompt.manualConfig && typeof agentPrompt.manualConfig === 'object' ? (agentPrompt.manualConfig as any) : null;
    const variables = manualConfig
      ? { ...(manualConfig.flowVariables ?? {}), ...(manualConfig.variables ?? {}) }
      : null;

    return {
      agent: {
        id: agentPrompt.id,
        name: agentPrompt.name,
        type: agentPrompt.promptType ?? 'USER_RAW',
        version: agentPrompt.version ?? 1,
        updatedAt: agentPrompt.updatedAt
      },
      prompt: agentPrompt.prompt,
      variables,
      config: manualConfig
    };
  }
}
