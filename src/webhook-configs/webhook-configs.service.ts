import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateWebhookConfigDto {
  origin: string;
  url: string;
  headers?: Record<string, unknown> | null;
  active?: boolean;
}

export interface UpdateWebhookConfigDto {
  origin?: string;
  url?: string;
  headers?: Record<string, unknown> | null;
  active?: boolean;
}

@Injectable()
export class WebhookConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, origin?: string) {
    return (this.prisma as any).webhookConfig.findMany({
      where: { userId, ...(origin ? { origin } : {}) },
      orderBy: { createdAt: 'desc' }
    });
  }

  create(userId: string, dto: CreateWebhookConfigDto) {
    return (this.prisma as any).webhookConfig.create({
      data: {
        userId,
        origin: dto.origin,
        url: dto.url,
        headers: dto.headers ?? null,
        active: dto.active ?? true
      }
    });
  }

  async update(userId: string, id: string, dto: UpdateWebhookConfigDto) {
    const cfg = await (this.prisma as any).webhookConfig.findFirst({ where: { id, userId } });
    if (!cfg) throw new NotFoundException('WebhookConfig não encontrado');
    return (this.prisma as any).webhookConfig.update({
      where: { id },
      data: {
        origin: dto.origin ?? cfg.origin,
        url: dto.url ?? cfg.url,
        headers: dto.headers ?? cfg.headers,
        active: dto.active ?? cfg.active
      }
    });
  }

  async remove(userId: string, id: string) {
    const cfg = await (this.prisma as any).webhookConfig.findFirst({ where: { id, userId } });
    if (!cfg) throw new NotFoundException('WebhookConfig não encontrado');
    return (this.prisma as any).webhookConfig.delete({ where: { id } });
  }
}
