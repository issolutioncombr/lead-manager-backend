import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgentPromptService {
  constructor(private readonly prisma: PrismaService) {}

  async getLegacyPrompt(userId: string): Promise<string> {
    const record = await (this.prisma as any).legacyAgentPrompt.findUnique({
      where: { userId }
    });
    return record?.prompt ?? '';
  }

  async updateLegacyPrompt(userId: string, prompt?: string | null): Promise<string> {
    const normalized = prompt ?? '';

    const record = await (this.prisma as any).legacyAgentPrompt.upsert({
      where: { userId },
      update: { prompt: normalized },
      create: {
        userId,
        prompt: normalized
      }
    });

    return record.prompt ?? '';
  }

  async getLegacyPromptForInstance(userId: string, instanceId: string): Promise<string> {
    const instanceKey = (instanceId ?? '').trim();
    if (!instanceKey) return '';
    const record = await (this.prisma as any).evolutionInstance.findFirst({
      where: { userId, OR: [{ instanceId: instanceKey }, { providerInstanceId: instanceKey }] },
      select: { agentPrompt: true }
    });
    return record?.agentPrompt ?? '';
  }

  async updateLegacyPromptForInstance(userId: string, instanceId: string, prompt?: string | null): Promise<string> {
    const instanceKey = (instanceId ?? '').trim();
    if (!instanceKey) {
      throw new NotFoundException('Instância inválida');
    }
    const normalized = prompt ?? '';
    const instance = await (this.prisma as any).evolutionInstance.findFirst({
      where: { userId, OR: [{ instanceId: instanceKey }, { providerInstanceId: instanceKey }] },
      select: { id: true }
    });
    if (!instance?.id) {
      throw new NotFoundException('Instância não encontrada');
    }
    await (this.prisma as any).evolutionInstance.update({
      where: { id: instance.id },
      data: { agentPrompt: normalized }
    });
    return normalized;
  }

  async listPrompts(userId: string) {
    return await (this.prisma as any).agentPrompt.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }]
    });
  }

  async createPrompt(userId: string, data: { name?: string | null; prompt: string }) {
    const prompt = (data.prompt ?? '').trim();
    if (!prompt) throw new BadRequestException('Prompt é obrigatório');
    if (prompt.length > 20000) throw new BadRequestException('Prompt muito grande');
    const name = (data.name ?? '').trim() || null;
    return await (this.prisma as any).agentPrompt.create({
      data: {
        userId,
        name,
        prompt,
        active: true
      }
    });
  }

  async updatePrompt(userId: string, promptId: string, data: { name?: string | null; prompt?: string | null; active?: boolean }) {
    const id = (promptId ?? '').trim();
    if (!id) throw new NotFoundException('Prompt não encontrado');
    const existing = await (this.prisma as any).agentPrompt.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing?.id) throw new NotFoundException('Prompt não encontrado');
    const update: any = {};
    if (data.name !== undefined) update.name = (data.name ?? '').trim() || null;
    if (data.prompt !== undefined) {
      const p = (data.prompt ?? '').trim();
      if (!p) throw new BadRequestException('Prompt é obrigatório');
      if (p.length > 20000) throw new BadRequestException('Prompt muito grande');
      update.prompt = p;
    }
    if (data.active !== undefined) update.active = !!data.active;
    return await (this.prisma as any).agentPrompt.update({ where: { id }, data: update });
  }

  async deletePrompt(userId: string, promptId: string) {
    const id = (promptId ?? '').trim();
    if (!id) throw new NotFoundException('Prompt não encontrado');
    const existing = await (this.prisma as any).agentPrompt.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing?.id) throw new NotFoundException('Prompt não encontrado');
    await (this.prisma as any).agentPrompt.delete({ where: { id } });
    return { ok: true };
  }

  private async resolveEvolutionInstanceByKey(userId: string, instanceKey: string) {
    const key = (instanceKey ?? '').trim();
    if (!key) throw new NotFoundException('Instância inválida');
    const inst = await (this.prisma as any).evolutionInstance.findFirst({
      where: { userId, OR: [{ instanceId: key }, { providerInstanceId: key }] },
      select: { id: true, instanceId: true, providerInstanceId: true }
    });
    if (!inst?.id) throw new NotFoundException('Instância não encontrada');
    return inst;
  }

  async listInstancePromptLinks(userId: string, instanceKey: string) {
    const inst = await this.resolveEvolutionInstanceByKey(userId, instanceKey);
    const links = await (this.prisma as any).evolutionInstanceAgentPrompt.findMany({
      where: { userId, evolutionInstanceId: inst.id },
      orderBy: [{ createdAt: 'asc' }],
      include: { agentPrompt: true }
    });
    return {
      instance: inst,
      links: links.map((l: any) => ({
        promptId: l.agentPromptId,
        percent: l.percent,
        active: l.active,
        prompt: {
          id: l.agentPrompt.id,
          name: l.agentPrompt.name,
          prompt: l.agentPrompt.prompt,
          active: l.agentPrompt.active,
          createdAt: l.agentPrompt.createdAt,
          updatedAt: l.agentPrompt.updatedAt
        }
      }))
    };
  }

  async setInstancePromptLinks(
    userId: string,
    instanceKey: string,
    items: Array<{ promptId: string; percent: number; active?: boolean }>
  ) {
    const inst = await this.resolveEvolutionInstanceByKey(userId, instanceKey);
    const normalized = (Array.isArray(items) ? items : []).map((it) => ({
      promptId: String(it.promptId ?? '').trim(),
      percent: Number(it.percent),
      active: it.active !== undefined ? !!it.active : true
    }));

    for (const it of normalized) {
      if (!it.promptId) throw new BadRequestException('promptId é obrigatório');
      if (!Number.isFinite(it.percent) || Math.floor(it.percent) !== it.percent) throw new BadRequestException('percent inválido');
      if (it.percent < 0 || it.percent > 100) throw new BadRequestException('percent deve estar entre 0 e 100');
    }
    const sum = normalized.reduce((acc, it) => acc + (it.active ? it.percent : 0), 0);
    if (normalized.length > 0 && sum !== 100) {
      throw new BadRequestException('A soma dos percentuais ativos deve ser 100');
    }
    const ids = Array.from(new Set(normalized.map((i) => i.promptId)));
    const owned = await (this.prisma as any).agentPrompt.findMany({ where: { userId, id: { in: ids } }, select: { id: true } });
    const ownedSet = new Set(owned.map((p: any) => p.id));
    for (const id of ids) {
      if (!ownedSet.has(id)) throw new BadRequestException(`Prompt inválido: ${id}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).evolutionInstanceAgentPrompt.deleteMany({ where: { userId, evolutionInstanceId: inst.id } });
      if (normalized.length) {
        await (tx as any).evolutionInstanceAgentPrompt.createMany({
          data: normalized.map((it) => ({
            userId,
            evolutionInstanceId: inst.id,
            agentPromptId: it.promptId,
            percent: it.percent,
            active: it.active
          }))
        });
      }
    });

    return await this.listInstancePromptLinks(userId, instanceKey);
  }
}
