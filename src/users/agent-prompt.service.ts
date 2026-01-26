import { Injectable } from '@nestjs/common';

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
}
