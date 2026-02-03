import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EvolutionService } from './evolution.service';

function normalizePhone(phone: string): string {
  const d = phone.replace(/\D+/g, '');
  return d.startsWith('0') ? d.replace(/^0+/, '') : d;
}

@Injectable()
export class EvolutionMessagesService {
  constructor(private readonly prisma: PrismaService, private readonly evolution: EvolutionService) {}

  async sendMessage(userId: string, payload: {
    phone: string;
    text?: string;
    mediaUrl?: string;
    caption?: string;
    clientMessageId?: string;
    instanceId?: string;
  }) {
    const normalized = normalizePhone(payload.phone);
    if (!normalized || normalized.length < 7) {
      throw new BadRequestException('Telefone inválido');
    }

    const remoteJid = `${normalized}@s.whatsapp.net`;
    const wamid = payload.clientMessageId ? `client-${payload.clientMessageId}` : `client-${randomUUID()}`;

    const now = new Date();

    const record: Record<string, any> = {
      userId,
      wamid,
      remoteJid,
      phoneRaw: normalized,
      fromMe: true,
      direction: 'OUTBOUND',
      messageType: payload.mediaUrl ? 'media' : 'text',
      conversation: payload.text ?? null,
      mediaUrl: payload.mediaUrl ?? null,
      caption: payload.caption ?? null,
      deliveryStatus: 'QUEUED',
      timestamp: now,
      rawJson: {
        clientMessageId: payload.clientMessageId ?? null,
        instanceId: payload.instanceId ?? null
      }
    };

    await (this.prisma as any).whatsappMessage.upsert({
      where: { wamid },
      create: record,
      update: record
    });

    return { id: wamid, status: 'queued' };
  }

  async listConversation(userId: string, phone: string, opts?: { direction?: 'inbound' | 'outbound'; page?: number; limit?: number }) {
    const normalized = normalizePhone(phone);
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Record<string, any> = { userId, phoneRaw: normalized };
    if (opts?.direction === 'inbound') where.fromMe = false;
    if (opts?.direction === 'outbound') where.fromMe = true;

    const [data, total] = await Promise.all([
      (this.prisma as any).whatsappMessage.findMany({
        where,
        orderBy: { timestamp: 'asc' },
        skip,
        take: limit,
        select: {
          id: true,
          wamid: true,
          fromMe: true,
          direction: true,
          conversation: true,
          caption: true,
          mediaUrl: true,
          messageType: true,
          deliveryStatus: true,
          timestamp: true,
          pushName: true,
          phoneRaw: true
        }
      }),
      (this.prisma as any).whatsappMessage.count({ where })
    ]);

    return { data, total, page, limit };
  }
}
