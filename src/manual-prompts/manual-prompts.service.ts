import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeUserConfig, renderPromptFromCategory } from './manual-prompt-renderer';

const normalizeText = (value?: string | null) => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

@Injectable()
export class ManualPromptsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return (this.prisma as any).agentPrompt.findMany({
      where: { userId, promptType: 'USER_MANUAL' },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        userId: true,
        promptCategoryId: true,
        name: true,
        active: true,
        promptType: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        manualConfig: true
      }
    });
  }

  async get(userId: string, id: string) {
    const promptId = String(id ?? '').trim();
    if (!promptId) throw new NotFoundException('Prompt não encontrado');
    const row = await (this.prisma as any).agentPrompt.findFirst({
      where: { id: promptId, userId, promptType: 'USER_MANUAL' }
    });
    if (!row) throw new NotFoundException('Prompt não encontrado');
    const cfg = row.manualConfig && typeof row.manualConfig === 'object' ? (row.manualConfig as any) : {};
    const categoryId = String(cfg?.categoryId ?? row.promptCategoryId ?? '').trim() || null;
    const userConfig =
      (cfg?.version === 3 || cfg?.version === 2) && cfg?.user && typeof cfg.user === 'object'
        ? cfg.user
        : {
            strategy: cfg?.strategy,
            language: cfg?.language,
            businessRules: cfg?.businessRules,
            serviceParameters: cfg?.serviceParameters,
            faqs: cfg?.faqs
          };
    return {
      id: row.id,
      agentName: row.name,
      active: row.active,
      version: row.version,
      categoryId,
      config: userConfig ?? {}
    };
  }

  async create(userId: string, input: any) {
    const agentName = normalizeText(input?.agentName);
    if (!agentName) throw new BadRequestException('agentName é obrigatório');
    const categoryId = String(input?.categoryId ?? '').trim();
    if (!categoryId) throw new BadRequestException('categoryId é obrigatório');
    const category = await (this.prisma as any).promptCategory.findFirst({
      where: { id: categoryId, active: true },
      select: { id: true, basePrompt: true, adminRules: true, tools: true, requiredVariables: true, variables: true }
    });
    if (!category?.id) throw new NotFoundException('Categoria não encontrada');
    const userConfig = normalizeUserConfig(input);
    const manualConfig = { version: 3, categoryId: category.id, user: userConfig };
    const prompt = renderPromptFromCategory(agentName, category, userConfig);
    return (this.prisma as any).agentPrompt.create({
      data: {
        userId,
        promptCategoryId: category.id,
        name: agentName,
        prompt,
        active: input?.active !== undefined ? Boolean(input.active) : true,
        promptType: 'USER_MANUAL',
        createdByUserId: userId,
        manualConfig,
        version: 1
      },
      select: { id: true, name: true, active: true, promptType: true, version: true, createdAt: true, updatedAt: true }
    });
  }

  async update(userId: string, id: string, input: any) {
    const promptId = String(id ?? '').trim();
    if (!promptId) throw new NotFoundException('Prompt não encontrado');
    const existing = await (this.prisma as any).agentPrompt.findFirst({
      where: { id: promptId, userId, promptType: 'USER_MANUAL' }
    });
    if (!existing) throw new NotFoundException('Prompt não encontrado');

    const nextName = input?.agentName !== undefined ? normalizeText(input.agentName) : normalizeText(existing.name);
    if (!nextName) throw new BadRequestException('agentName é obrigatório');
    const prevCfg = existing.manualConfig && typeof existing.manualConfig === 'object' ? (existing.manualConfig as any) : {};
    const categoryId = String(input?.categoryId ?? prevCfg?.categoryId ?? existing.promptCategoryId ?? '').trim();
    if (!categoryId) throw new BadRequestException('categoryId é obrigatório');
    const category = await (this.prisma as any).promptCategory.findFirst({
      where: { id: categoryId, active: true },
      select: { id: true, basePrompt: true, adminRules: true, tools: true, requiredVariables: true, variables: true }
    });
    if (!category?.id) throw new NotFoundException('Categoria não encontrada');

    const mergedUser = normalizeUserConfig({ ...(prevCfg?.user ?? prevCfg ?? {}), ...input });
    const manualConfig =
      prevCfg?.version === 2 && prevCfg?.admin
        ? { ...prevCfg, user: mergedUser, categoryId: category.id, version: 3 }
        : { version: 3, categoryId: category.id, user: mergedUser };
    const prompt = renderPromptFromCategory(nextName, category, mergedUser);

    return (this.prisma as any).agentPrompt.update({
      where: { id: promptId },
      data: {
        name: nextName,
        promptCategoryId: category.id,
        ...(input?.active !== undefined ? { active: Boolean(input.active) } : {}),
        manualConfig,
        prompt,
        version: { increment: 1 }
      },
      select: { id: true, name: true, active: true, promptType: true, version: true, createdAt: true, updatedAt: true }
    });
  }
}
