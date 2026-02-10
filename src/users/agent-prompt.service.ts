import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgentPromptService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrompt(userId: string): Promise<string> {
    const record = await this.prisma.agentPrompt.findUnique({
      where: { userId }
    });
    return record?.prompt ?? '';
  }

  async updatePrompt(userId: string, prompt?: string | null): Promise<string> {
    const normalized = prompt ?? '';

    const record = await this.prisma.agentPrompt.upsert({
      where: { userId },
      update: { prompt: normalized },
      create: {
        userId,
        prompt: normalized
      }
    });

    return record.prompt ?? '';
  }

  async getPromptForInstance(userId: string, instanceId: string): Promise<string> {
    const instanceKey = (instanceId ?? '').trim();
    if (!instanceKey) return '';
    const record = await this.prisma.evolutionInstance.findFirst({
      where: { userId, OR: [{ instanceId: instanceKey }, { providerInstanceId: instanceKey }] },
      select: { agentPrompt: true }
    });
    return record?.agentPrompt ?? '';
  }

  async updatePromptForInstance(userId: string, instanceId: string, prompt?: string | null): Promise<string> {
    const instanceKey = (instanceId ?? '').trim();
    if (!instanceKey) {
      throw new NotFoundException('Instância inválida');
    }
    const normalized = prompt ?? '';
    const instance = await this.prisma.evolutionInstance.findFirst({
      where: { userId, OR: [{ instanceId: instanceKey }, { providerInstanceId: instanceKey }] },
      select: { id: true }
    });
    if (!instance?.id) {
      throw new NotFoundException('Instância não encontrada');
    }
    await this.prisma.evolutionInstance.update({
      where: { id: instance.id },
      data: { agentPrompt: normalized }
    });
    return normalized;
  }
}
