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
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly prisma: PrismaService, private readonly evolution: EvolutionService) {}

  async sendMessage(userId: string, payload: {
    phone: string;
    text?: string;
    mediaUrl?: string;
    caption?: string;
    clientMessageId?: string;
    instanceId?: string;
  }) {
    const nowMs = Date.now();
    const bucket = this.buckets.get(userId) ?? { count: 0, resetAt: nowMs + 60_000 };
    if (nowMs > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = nowMs + 60_000;
    }
    bucket.count += 1;
    this.buckets.set(userId, bucket);
    if (bucket.count > 30) {
      throw new BadRequestException('Limite de envio excedido');
    }

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
    if (payload.mediaUrl) {
      const ok = await this.validateMedia(payload.mediaUrl);
      if (!ok) {
        await (this.prisma as any).whatsappMessage.update({
          where: { wamid },
          data: { deliveryStatus: 'FAILED' }
        });
        throw new BadRequestException('Mídia inválida ou muito grande');
      }
    }

    try {
      const providerResp = await this.evolution.sendMessage({
        instanceId: payload.instanceId ?? null,
        number: `+${normalized}`,
        text: payload.text,
        mediaUrl: payload.mediaUrl,
        caption: payload.caption
      });
      await (this.prisma as any).whatsappMessage.update({
        where: { wamid },
        data: { deliveryStatus: 'SENT', rawJson: { ...(record.rawJson ?? {}), providerResp } }
      });
      return { id: wamid, status: 'sent' };
    } catch {
      await (this.prisma as any).whatsappMessage.update({
        where: { wamid },
        data: { deliveryStatus: 'FAILED' }
      });
      return { id: wamid, status: 'failed' };
    }
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

  private async validateMedia(url: string): Promise<boolean> {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      if (!resp.ok) return false;
      const type = resp.headers.get('content-type') || '';
      const len = parseInt(resp.headers.get('content-length') || '0', 10);
      const allowed = type.startsWith('image/') || type.startsWith('application/') || type.startsWith('video/');
      const max = 10 * 1024 * 1024;
      return allowed && (!len || len <= max);
    } catch {
      return false;
    }
  }
}
