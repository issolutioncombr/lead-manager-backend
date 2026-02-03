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

  async listConversation(userId: string, phone: string, opts?: { direction?: 'inbound' | 'outbound'; page?: number; limit?: number; instanceId?: string }) {
    const normalized = normalizePhone(phone);
    const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
    const token = await this.resolveToken(userId, opts?.instanceId);
    let items: any[] = [];
    try {
      const provider = await this.evolution.getConversation(`+${normalized}`, {
        limit,
        token: token ?? undefined,
        instanceId: opts?.instanceId
      });
      items = Array.isArray((provider as any)?.messages) ? (provider as any).messages : (provider as any)?.data ?? [];
    } catch {
      const local = await (this.prisma as any).whatsappMessage.findMany({
        where: { userId, phoneRaw: normalized },
        orderBy: { timestamp: 'asc' },
        take: limit
      });
      items = Array.isArray(local) ? local.map((m: any) => ({
        id: m.wamid ?? `${normalized}-${m.timestamp?.getTime?.() ?? Date.now()}`,
        key: { id: m.wamid ?? null, fromMe: !!m.fromMe },
        message: m.mediaUrl
          ? { imageMessage: { url: m.mediaUrl, caption: m.caption ?? null } }
          : { conversation: m.conversation ?? null },
        messageType: m.messageType ?? (m.mediaUrl ? 'media' : (m.conversation ? 'text' : null)),
        messageTimestamp: Math.floor((m.timestamp instanceof Date ? m.timestamp.getTime() : new Date(m.timestamp).getTime()) / 1000),
        pushName: m.pushName ?? null
      })) : [];
    }
    const data = items
      .map((m: any) => {
        const key = m?.key ?? {};
        const msg = m?.message ?? {};
        const fromMe = !!key.fromMe;
        const text = msg?.conversation ?? msg?.extendedTextMessage?.text ?? msg?.imageMessage?.caption ?? null;
        const mediaUrl = msg?.imageMessage?.url ?? msg?.videoMessage?.url ?? msg?.documentMessage?.url ?? null;
        const type = m?.messageType ?? (mediaUrl ? 'media' : (text ? 'text' : null));
        const ts = m?.messageTimestamp ?? m?.timestamp ?? Date.now() / 1000;
        return {
          id: m?.id ?? key?.id ?? m?.wamid ?? `${normalized}-${ts}`,
          wamid: key?.id ?? m?.wamid ?? null,
          fromMe,
          direction: fromMe ? 'OUTBOUND' : 'INBOUND',
          conversation: text,
          caption: msg?.imageMessage?.caption ?? msg?.videoMessage?.caption ?? msg?.documentMessage?.caption ?? null,
          mediaUrl,
          messageType: type,
          deliveryStatus: undefined,
          timestamp: new Date((Number(ts) || Math.floor(Date.now() / 1000)) * 1000),
          pushName: m?.pushName ?? m?.name ?? null,
          phoneRaw: normalized
        };
      })
      .filter((entry: any) => (opts?.direction === 'inbound' ? !entry.fromMe : opts?.direction === 'outbound' ? entry.fromMe : true));
    // Provider response may not support pagination; return current slice
    return { data, total: data.length, page: 1, limit };
  }

  async listConversationPublic(phone: string, opts?: { limit?: number }) {
    const normalized = normalizePhone(phone);
    const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
    const local = await (this.prisma as any).whatsappMessage.findMany({
      where: { phoneRaw: normalized },
      orderBy: { timestamp: 'asc' },
      take: limit
    });
    const items = Array.isArray(local) ? local.map((m: any) => ({
      id: m.wamid ?? `${normalized}-${m.timestamp?.getTime?.() ?? Date.now()}`,
      key: { id: m.wamid ?? null, fromMe: !!m.fromMe },
      message: m.mediaUrl
        ? { imageMessage: { url: m.mediaUrl, caption: m.caption ?? null } }
        : { conversation: m.conversation ?? null },
      messageType: m.messageType ?? (m.mediaUrl ? 'media' : (m.conversation ? 'text' : null)),
      messageTimestamp: Math.floor((m.timestamp instanceof Date ? m.timestamp.getTime() : new Date(m.timestamp).getTime()) / 1000),
      pushName: m.pushName ?? null
    })) : [];
    const data = items.map((m: any) => {
      const key = m?.key ?? {};
      const msg = m?.message ?? {};
      const fromMe = !!key.fromMe;
      const text = msg?.conversation ?? msg?.extendedTextMessage?.text ?? msg?.imageMessage?.caption ?? null;
      const mediaUrl = msg?.imageMessage?.url ?? msg?.videoMessage?.url ?? msg?.documentMessage?.url ?? null;
      const type = m?.messageType ?? (mediaUrl ? 'media' : (text ? 'text' : null));
      const ts = m?.messageTimestamp ?? m?.timestamp ?? Date.now() / 1000;
      return {
        id: m?.id ?? key?.id ?? m?.wamid ?? `${normalized}-${ts}`,
        wamid: key?.id ?? m?.wamid ?? null,
        fromMe,
        direction: fromMe ? 'OUTBOUND' : 'INBOUND',
        conversation: text,
        caption: msg?.imageMessage?.caption ?? msg?.videoMessage?.caption ?? msg?.documentMessage?.caption ?? null,
        mediaUrl,
        messageType: type,
        deliveryStatus: undefined,
        timestamp: new Date((Number(ts) || Math.floor(Date.now() / 1000)) * 1000),
        pushName: m?.pushName ?? m?.name ?? null,
        phoneRaw: normalized
      };
    });
    return { data, total: data.length, page: 1, limit };
  }

  async listChats(userId: string, opts?: { instanceId?: string; limit?: number }) {
    const token = await this.resolveToken(userId, opts?.instanceId);
    let items: any[] = [];
    try {
      const provider = await this.evolution.listChats({ instanceId: opts?.instanceId, limit: opts?.limit ?? 100, token: token ?? undefined });
      items = Array.isArray((provider as any)?.chats) ? (provider as any).chats : (provider as any)?.data ?? [];
    } catch {
      const recent = await (this.prisma as any).whatsappMessage.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: Math.max(10, Math.min(500, opts?.limit ?? 100))
      });
      const seen = new Set<string>();
      items = [];
      for (const m of recent) {
        const phone = (m.phoneRaw ?? '').replace(/\D+/g, '');
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        items.push({
          id: m.wamid ?? phone,
          remoteJid: `${phone}@s.whatsapp.net`,
          pushName: m.pushName ?? null,
          lastMessage: {
            message: m.mediaUrl ? { imageMessage: { caption: m.caption ?? null } } : { conversation: m.conversation ?? null },
            messageTimestamp: Math.floor((m.timestamp instanceof Date ? m.timestamp.getTime() : new Date(m.timestamp).getTime()) / 1000),
            key: { fromMe: !!m.fromMe }
          }
        });
      }
    }
    const data = items
      .map((c: any) => {
        const phone = (c?.remoteJid ?? c?.jid ?? '').replace('@s.whatsapp.net', '') || c?.phoneRaw || null;
        const normalized = phone ? phone.replace(/\D+/g, '') : null;
        const last = c?.lastMessage ?? c?.message ?? {};
        const lastText = last?.conversation ?? last?.message?.conversation ?? last?.extendedTextMessage?.text ?? last?.imageMessage?.caption ?? null;
        const lastTs = last?.messageTimestamp ?? last?.timestamp ?? c?.timestamp ?? null;
        return {
          id: c?.id ?? normalized ?? Math.random().toString(36).slice(2),
          name: c?.pushName ?? c?.name ?? null,
          contact: normalized,
          lastMessage: lastText ? { text: lastText, timestamp: lastTs ? new Date(Number(lastTs) * 1000).toISOString() : new Date().toISOString(), fromMe: !!(last?.key?.fromMe) } : null
        };
      })
      .filter((x: any) => !!x.contact);
    return data;
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

  private async resolveToken(userId: string, instanceId?: string | null): Promise<string | null> {
    const where: any = instanceId ? { userId, instanceId } : { userId };
    const record = await (this.prisma as any).evolutionInstance.findFirst({
      where,
      orderBy: { updatedAt: 'desc' }
    });
    const meta = record?.metadata;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      return process.env.EVOLUTION_DEFAULT_TOKEN ?? null;
    }
    const token = (meta as any).token;
    if (typeof token === 'string' && token.length > 0) {
      return token;
    }
    return process.env.EVOLUTION_DEFAULT_TOKEN ?? null;
  }
}
