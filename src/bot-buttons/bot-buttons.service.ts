import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateBotButtonDto {
  name: string;
  variable: string;
  url: string;
  active?: boolean;
}

export interface UpdateBotButtonDto {
  name?: string;
  variable?: string;
  url?: string;
  active?: boolean;
}

@Injectable()
export class BotButtonsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, active?: boolean) {
    return (this.prisma as any).botButton.findMany({
      where: { userId, ...(typeof active === 'boolean' ? { active } : {}) },
      orderBy: { createdAt: 'desc' }
    });
  }

  create(userId: string, dto: CreateBotButtonDto) {
    return (this.prisma as any).botButton.create({
      data: { userId, name: dto.name, variable: dto.variable, url: dto.url, active: dto.active ?? true }
    });
  }

  async update(userId: string, id: string, dto: UpdateBotButtonDto) {
    const btn = await (this.prisma as any).botButton.findFirst({ where: { id, userId } });
    if (!btn) throw new NotFoundException('BotButton não encontrado');
    return (this.prisma as any).botButton.update({
      where: { id },
      data: {
        name: dto.name ?? btn.name,
        variable: dto.variable ?? btn.variable,
        url: dto.url ?? btn.url,
        active: typeof dto.active === 'boolean' ? dto.active : btn.active
      }
    });
  }

  async remove(userId: string, id: string) {
    const btn = await (this.prisma as any).botButton.findFirst({ where: { id, userId } });
    if (!btn) throw new NotFoundException('BotButton não encontrado');
    return (this.prisma as any).botButton.delete({ where: { id } });
  }

  async trigger(userId: string, id: string, leadId: string) {
    const btn = await (this.prisma as any).botButton.findFirst({ where: { id, userId, active: true } });
    if (!btn) throw new NotFoundException('BotButton inválido');
    const lead = await (this.prisma as any).lead.findFirst({ where: { id: leadId, userId } });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    const payload = {
      origin: 'bot-button',
      userId,
      button: { id: btn.id, name: btn.name, variable: btn.variable },
      lead: { id: lead.id, name: lead.name, phone: lead.contact },
      timestamp: new Date().toISOString()
    };
    const webhook = await (this.prisma as any).webhook.create({
      data: {
        userId,
        phoneRaw: lead.contact,
        receivedAt: new Date(),
        rawJson: payload,
        outboundJson: payload,
        outboundUrl: btn.url
      }
    });
    try {
      const resp = await fetch(btn.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        await (this.prisma as any).webhook.update({
          where: { id: webhook.id },
          data: { status: 'sent', sentAt: new Date() }
        });
      }
    } catch (err) {
      await (this.prisma as any).webhook.update({
        where: { id: webhook.id },
        data: { status: 'failed' }
      });
    }
    return { ok: true };
  }

  async triggerByPhone(userId: string, id: string, phoneRaw: string) {
    const btn = await (this.prisma as any).botButton.findFirst({ where: { id, userId, active: true } });
    if (!btn) throw new NotFoundException('BotButton inválido');
    const lead = await (this.prisma as any).lead.findFirst({ where: { userId, contact: phoneRaw } });
    if (!lead) throw new NotFoundException('Lead não encontrado para o telefone informado');
    return this.trigger(userId, id, lead.id);
  }
}
