import { Controller, Get, Headers, NotFoundException, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';
import { normalizeUserConfig, renderPromptFromCategory } from '../manual-prompts/manual-prompt-renderer';

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
        promptCategoryId: true,
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
    let resolvedPrompt = agentPrompt.prompt;
    let variables: any = null;
    let resolvedConfig: any = manualConfig;
    if (agentPrompt.promptType === 'USER_MANUAL' && manualConfig?.version === 3) {
      const categoryId = String(manualConfig?.categoryId ?? agentPrompt.promptCategoryId ?? '').trim();
      if (!categoryId) throw new NotFoundException();
      const category = await (this.prisma as any).promptCategory.findFirst({
        where: { id: categoryId, active: true },
        select: { id: true, name: true, basePrompt: true, adminRules: true, tools: true, requiredVariables: true, variables: true }
      });
      if (!category?.id) throw new NotFoundException();
      const agentName = String(agentPrompt.name ?? '').trim() || 'Agente';
      const userCfgRaw = manualConfig?.user && typeof manualConfig.user === 'object' ? manualConfig.user : {};
      const userCfg = normalizeUserConfig(userCfgRaw);
      resolvedPrompt = renderPromptFromCategory(agentName, category, userCfg);
      variables = category.variables ?? null;
      resolvedConfig = { ...manualConfig, category: { id: category.id, name: category.name, adminRules: category.adminRules, tools: category.tools, requiredVariables: category.requiredVariables, variables: category.variables } };
    } else {
      variables = (() => {
        if (!manualConfig) return null;
        if (manualConfig?.version === 2) {
          const admin = manualConfig?.admin && typeof manualConfig.admin === 'object' ? manualConfig.admin : null;
          return admin ? (admin as any).variables ?? null : null;
        }
        return manualConfig.variables ?? null;
      })();
    }

    return {
      agent: {
        id: agentPrompt.id,
        name: agentPrompt.name,
        type: agentPrompt.promptType ?? 'USER_RAW',
        version: agentPrompt.version ?? 1,
        updatedAt: agentPrompt.updatedAt
      },
      prompt: resolvedPrompt,
      variables,
      config: resolvedConfig
    };
  }
}
