import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EvolutionService } from './evolution.service';
import { MessageEventsService } from './message-events.service';

function normalizePhone(phone: string): string {
  const d = phone.replace(/\D+/g, '');
  return d.startsWith('0') ? d.replace(/^0+/, '') : d;
}

@Injectable()
export class EvolutionMessagesService {
  private readonly logger = new Logger(EvolutionMessagesService.name);
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly chatsCache = new Map<string, { expiresAt: number; items: any[] }>();
  private readonly profilePicCache = new Map<string, { expiresAt: number; value: string | null }>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionService,
    private readonly events: MessageEventsService
  ) {}

  private async getInstanceMetaMap(userId: string): Promise<Map<string, { publicId: string; number: string | null; profilePicUrl: string | null }>> {
    const model = (this.prisma as any).evolutionInstance;
    if (typeof model?.findMany !== 'function') return new Map();
    const records = await model.findMany({
      where: { userId },
      select: { instanceId: true, providerInstanceId: true, metadata: true }
    });
    const readString = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const map = new Map<string, { publicId: string; number: string | null; profilePicUrl: string | null }>();
    for (const r of records ?? []) {
      const instanceId = readString(r?.instanceId);
      const providerInstanceId = readString(r?.providerInstanceId);
      const publicId = providerInstanceId ?? instanceId;
      if (!publicId) continue;
      const meta: any = r?.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata) ? r.metadata : {};
      const number = readString(meta?.number) ?? readString(meta?.requestedNumber) ?? null;
      const profilePicUrl = readString(meta?.profilePicUrl) ?? null;
      const payload = { publicId, number, profilePicUrl };
      if (instanceId) map.set(instanceId, payload);
      if (providerInstanceId) map.set(providerInstanceId, payload);
      map.set(publicId, payload);
    }
    return map;
  }

  private extractOriginInstanceId(value: any): string | null {
    const readString = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const direct = readString(value?.instanceId) ?? readString(value?.originInstanceId) ?? readString(value?.__originInstanceId);
    if (direct) return direct;
    const raw = value?.rawJson;
    if (raw && typeof raw === 'object') {
      return (
        readString((raw as any)?.instanceId) ??
        readString((raw as any)?.instance) ??
        readString((raw as any)?.body?.instance) ??
        readString((raw as any)?.body?.data?.instanceId) ??
        null
      );
    }
    return null;
  }

  private maskPhone(phoneRaw: string) {
    const digits = String(phoneRaw ?? '').replace(/\D+/g, '');
    if (digits.length < 4) return 'invalid';
    return `${digits.slice(0, 2)}*****${digits.slice(-2)}`;
  }

  private async readLocalChatsCached(userId: string, limit: number, opts?: { instanceIds?: string[] }): Promise<any[]> {
    const normalizedLimit = Math.max(10, Math.min(2000, limit));
    const instKey = (opts?.instanceIds ?? []).filter(Boolean).sort().join(',') || 'any';
    const key = `${userId}:${normalizedLimit}:${instKey}`;
    const now = Date.now();
    const cached = this.chatsCache.get(key);
    if (cached && cached.expiresAt > now) return cached.items;
    const items = await this.readLocalChatsAsProviderItems(userId, normalizedLimit, opts);
    this.chatsCache.set(key, { expiresAt: now + 3000, items });
    return items;
  }

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
    const instanceMeta = await this.getInstanceMetaMap(userId);
    const initialInstanceId = payload.instanceId ? (instanceMeta.get(payload.instanceId)?.publicId ?? payload.instanceId) : null;

    const record: Record<string, any> = {
      userId,
      wamid,
      remoteJid,
      phoneRaw: normalized,
      instanceId: initialInstanceId,
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
        instanceId: initialInstanceId
      }
    };

    await (this.prisma as any).whatsappMessage.upsert({
      where: { wamid },
      create: record,
      update: record
    });
    this.events.emit({ userId, phoneRaw: normalized, event: 'messages.send', wamid });
    let mediaType: string | undefined = undefined;
    if (payload.mediaUrl) {
      const media = await this.validateMedia(payload.mediaUrl);
      if (!media.ok) {
        await (this.prisma as any).whatsappMessage.update({
          where: { wamid },
          data: { deliveryStatus: 'FAILED' }
        });
        throw new BadRequestException('Mídia inválida ou muito grande');
      }
      mediaType = media.mediaType;
    }

    const instanceCandidates = await this.resolveInstanceCandidates(userId, payload.instanceId);
    let lastError: unknown = null;
    const sendWith = async (instanceId: string | null) => {
      const publicInstanceId = instanceId ? (instanceMeta.get(instanceId)?.publicId ?? instanceId) : null;
      const providerResp = await this.evolution.sendMessage({
        instanceId,
        number: `+${normalized}`,
        text: payload.text,
        mediaUrl: payload.mediaUrl,
        mediaType,
        caption: payload.caption
      });
      await (this.prisma as any).whatsappMessage.update({
        where: { wamid },
        data: {
          deliveryStatus: 'SENT',
          instanceId: publicInstanceId,
          rawJson: { ...(record.rawJson ?? {}), providerResp, instanceId: publicInstanceId }
        }
      });
      this.events.emit({ userId, phoneRaw: normalized, event: 'messages.send', wamid });
      this.logger.log(
        `sendMessage ok userId=${userId} instanceId=${payload.instanceId ?? 'auto'} phone=${this.maskPhone(normalized)} wamid=${wamid} status=SENT`
      );
      return { id: wamid, status: 'sent' as const };
    };
    if (!instanceCandidates.length) {
      try {
        return await sendWith(payload.instanceId ?? null);
      } catch (error) {
        lastError = error;
      }
    } else {
      for (const instanceId of instanceCandidates) {
        try {
          return await sendWith(instanceId);
        } catch (error) {
          lastError = error;
        }
      }
    }
    await (this.prisma as any).whatsappMessage.update({
      where: { wamid },
      data: { deliveryStatus: 'FAILED', rawJson: { ...(record.rawJson ?? {}), providerError: String((lastError as any)?.message ?? lastError ?? '') } }
    });
    this.events.emit({ userId, phoneRaw: normalized, event: 'messages.send', wamid });
    this.logger.warn(
      `sendMessage failed userId=${userId} instanceId=${payload.instanceId ?? 'auto'} phone=${this.maskPhone(normalized)} wamid=${wamid} status=FAILED`
    );
    return { id: wamid, status: 'failed' };
  }

  async listConversation(
    userId: string,
    phone: string,
    opts?: {
      direction?: 'inbound' | 'outbound';
      page?: number;
      limit?: number;
      instanceId?: string;
      remoteJid?: string;
      source?: 'provider' | 'local';
      beforeTimestamp?: string;
      beforeUpdatedAt?: string;
      cursor?: string;
    }
  ) {
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length < 7) {
      throw new BadRequestException('Telefone inválido');
    }
    const instanceMeta = await this.getInstanceMetaMap(userId);
    const requestedInstancePublicId = opts?.instanceId ? (instanceMeta.get(opts.instanceId)?.publicId ?? opts.instanceId) : null;
    const requestedInstanceCandidates = opts?.instanceId ? await this.resolveInstanceCandidates(userId, opts.instanceId) : [];
    const limit = Math.max(1, Math.min(1000, opts?.limit ?? 50));
    const beforeTimestamp = this.parseDateOrNull(opts?.beforeTimestamp);
    const beforeUpdatedAt = this.parseDateOrNull(opts?.beforeUpdatedAt);
    let items: any[] = [];
    const useProvider = opts?.source === 'provider'
      ? true
      : opts?.source === 'local'
      ? false
      : (process.env.EVOLUTION_PROVIDER_READ ?? 'false').toLowerCase() === 'true';
    this.logger.log(
      `listConversation start userId=${userId} phone=${this.maskPhone(normalized)} instanceId=${opts?.instanceId ?? 'auto'} source=${opts?.source ?? (useProvider ? 'provider' : 'local')} limit=${limit} beforeTimestamp=${beforeTimestamp ? beforeTimestamp.toISOString() : '-'} cursor=${opts?.cursor ? 'yes' : 'no'}`
    );
    if (useProvider) {
      let lastError: unknown = null;
      let lastProvider: any = null;
      const instanceCandidates = await this.resolveInstanceCandidates(userId, opts?.instanceId);
      const startedAt = Date.now();
      for (const instanceId of instanceCandidates) {
        try {
          const token = await this.resolveToken(userId, instanceId);
          let provider: any = null;
          const remoteJid = (opts?.remoteJid ?? `${normalized}@s.whatsapp.net`).trim();
          const providerInstanceName = await this.evolution.resolveInstanceName(instanceId);
          const originInstanceId = instanceMeta.get(instanceId)?.publicId ?? instanceId;
          try {
            provider = await this.evolution.findMessages({
              instanceId: providerInstanceName,
              where: { key: { remoteJid } },
              limit,
              token: token ?? undefined,
              cursor: opts?.cursor
            });
          } catch (e) {
            provider = await this.evolution.getConversation(`+${normalized}`, {
              instanceId: providerInstanceName,
              limit,
              cursor: opts?.cursor,
              token: token ?? undefined
            });
          }
          lastProvider = provider;
          const got = this.extractProviderConversationItems(provider);
          const annotated = (Array.isArray(got) ? got : []).map((m: any) =>
            m && typeof m === 'object' ? { ...m, __originInstanceId: originInstanceId } : m
          );
          items = [...items, ...annotated];
          lastError = null;
          if (opts?.instanceId) break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!opts?.instanceId && items.length) {
        lastError = null;
      }
      if (!lastError) {
        const shouldMergeLocal = !!opts?.instanceId;
        if (shouldMergeLocal) {
          const localItems = await this.readLocalConversationAsProviderItems(userId, normalized, limit, {
            beforeTimestamp,
            beforeUpdatedAt,
            instanceIds: requestedInstanceCandidates.length ? requestedInstanceCandidates : undefined
          });
          items = [...items, ...(Array.isArray(localItems) ? localItems : [])];
        }
        const { data } = this.buildConversationResponse(normalized, items, opts?.direction, instanceMeta, requestedInstancePublicId);
        const providerNext = this.extractProviderNextCursor(lastProvider);
        const oldest = data.length ? new Date(data[0].timestamp) : null;
        const hasMoreLocal = shouldMergeLocal && oldest
          ? !!(await (this.prisma as any).whatsappMessage.findFirst({
              where: {
                userId,
                OR: [
                  { phoneRaw: normalized },
                  { remoteJid: `${normalized}@s.whatsapp.net` },
                  { remoteJidAlt: `${normalized}@s.whatsapp.net` }
                ],
                ...(requestedInstanceCandidates.length ? { instanceId: { in: requestedInstanceCandidates } } : {}),
                timestamp: { lt: oldest }
              },
              select: { id: true }
            }))
          : false;
        return {
          data,
          total: data.length,
          page: 1,
          limit,
          hasMore: providerNext ? true : hasMoreLocal,
          nextCursor: providerNext ?? (hasMoreLocal && oldest ? oldest.toISOString() : null)
        };
      }
      if (lastError) {
        const status = lastError instanceof HttpException ? lastError.getStatus() : null;
        this.logger.warn(
          `Falha ao ler conversa no provider; usando fallback local. userId=${userId} phone=${this.maskPhone(normalized)} instanceId=${opts?.instanceId ?? 'auto'} status=${status ?? 'unknown'} durationMs=${Date.now() - startedAt}`
        );
        items = await this.readLocalConversationAsProviderItems(userId, normalized, limit, {
          beforeTimestamp,
          beforeUpdatedAt,
          instanceIds: requestedInstanceCandidates.length ? requestedInstanceCandidates : undefined
        });
      }
    } else {
      items = await this.readLocalConversationAsProviderItems(userId, normalized, limit, {
        beforeTimestamp,
        beforeUpdatedAt,
        instanceIds: requestedInstanceCandidates.length ? requestedInstanceCandidates : undefined
      });
    }
    const { data } = this.buildConversationResponse(normalized, items, opts?.direction, instanceMeta, requestedInstancePublicId);
    const oldest = data.length ? new Date(data[0].timestamp) : null;
    const hasMore =
      !!oldest &&
      !!(await (this.prisma as any).whatsappMessage.findFirst({
        where: {
          userId,
          OR: [
            { phoneRaw: normalized },
            { remoteJid: `${normalized}@s.whatsapp.net` },
            { remoteJidAlt: `${normalized}@s.whatsapp.net` }
          ],
          ...(requestedInstanceCandidates.length ? { instanceId: { in: requestedInstanceCandidates } } : {}),
          timestamp: { lt: oldest }
        },
        select: { id: true }
      }));
    return {
      data,
      total: data.length,
      page: 1,
      limit,
      hasMore,
      nextCursor: hasMore && oldest ? oldest.toISOString() : null
    };
  }

  private buildConversationResponse(
    normalizedPhone: string,
    items: any[],
    direction: 'inbound' | 'outbound' | undefined,
    instanceMeta: Map<string, { publicId: string; number: string | null; profilePicUrl: string | null }>,
    defaultOriginInstanceId: string | null
  ) {
    const seenIds = new Set<string>();
    const data = items
      .map((m: any) => {
        const key = m?.key ?? {};
        const msg = m?.message ?? {};
        const fromMe = !!key.fromMe;
        const text = msg?.conversation ?? msg?.extendedTextMessage?.text ?? msg?.imageMessage?.caption ?? null;
        const mediaUrl = msg?.imageMessage?.url ?? msg?.videoMessage?.url ?? msg?.documentMessage?.url ?? null;
        const type = m?.messageType ?? (mediaUrl ? 'media' : (text ? 'text' : null));
        const ts = m?.messageTimestamp ?? m?.timestamp ?? Date.now() / 1000;
        const originInstanceId = this.extractOriginInstanceId(m) ?? defaultOriginInstanceId ?? null;
        const originMeta = originInstanceId ? instanceMeta.get(originInstanceId) ?? null : null;
        return {
          id: m?.id ?? key?.id ?? m?.wamid ?? `${normalizedPhone}-${ts}`,
          wamid: key?.id ?? m?.wamid ?? null,
          fromMe,
          direction: fromMe ? 'OUTBOUND' : 'INBOUND',
          conversation: text,
          caption: msg?.imageMessage?.caption ?? msg?.videoMessage?.caption ?? msg?.documentMessage?.caption ?? null,
          mediaUrl,
          messageType: type,
          deliveryStatus: m?.deliveryStatus ?? null,
          timestamp: new Date((Number(ts) || Math.floor(Date.now() / 1000)) * 1000),
          pushName: m?.pushName ?? m?.name ?? null,
          phoneRaw: normalizedPhone,
          originInstanceId,
          originNumber: originMeta?.number ?? null,
          originProfilePicUrl: originMeta?.profilePicUrl ?? null
        };
      })
      .filter((e: any) => {
        const key = e?.wamid ? String(e.wamid) : `${e.timestamp?.toISOString?.() ?? ''}|${e.conversation ?? ''}|${e.mediaUrl ?? ''}|${e.caption ?? ''}`;
        if (seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
      })
      .filter((entry: any) => !!(entry.conversation || entry.caption || entry.mediaUrl || entry.messageType))
      .filter((entry: any) => (direction === 'inbound' ? !entry.fromMe : direction === 'outbound' ? entry.fromMe : true));
    data.sort((a: any, b: any) => {
      const ta = a?.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a?.timestamp).getTime();
      const tb = b?.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b?.timestamp).getTime();
      return ta - tb;
    });
    return { data };
  }

  async getProfilePicUrl(
    userId: string,
    opts: { jid?: string; phone?: string; instanceId?: string }
  ): Promise<string | null> {
    const jid = (() => {
      const j = String(opts.jid ?? '').trim();
      if (j) return j;
      const digits = String(opts.phone ?? '').replace(/\D+/g, '');
      if (!digits) return '';
      return `${digits}@s.whatsapp.net`;
    })();
    if (!jid) return null;
    const instanceKey = String(opts.instanceId ?? '').trim();
    if (instanceKey) {
      const cacheKey = `${userId}|${instanceKey}|${jid}`;
      const now = Date.now();
      const cached = this.profilePicCache.get(cacheKey);
      if (cached && cached.expiresAt > now) return cached.value;
      const url = await this.evolution.fetchProfilePicUrl({ instanceId: instanceKey, jid }).catch(() => null);
      const value = typeof url === 'string' && url.trim() ? url.trim() : null;
      this.profilePicCache.set(cacheKey, { value, expiresAt: now + 10 * 60_000 });
      return value;
    }
    const instanceCandidates = await this.resolveInstanceCandidates(userId, opts.instanceId);
    let last: string | null = null;
    for (const instanceId of instanceCandidates.length ? instanceCandidates : [opts.instanceId ?? '']) {
      const id = String(instanceId ?? '').trim();
      if (!id) continue;
      try {
        const url = await this.evolution.fetchProfilePicUrl({ instanceId: id, jid });
        if (url) return url;
        last = url;
      } catch {
        continue;
      }
    }
    return last;
  }

  async listUpdates(
    userId: string,
    phone: string,
    opts?: {
      limit?: number;
      instanceId?: string;
      source?: 'provider' | 'local';
      afterTimestamp?: string;
      afterUpdatedAt?: string;
    }
  ) {
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length < 7) {
      throw new BadRequestException('Telefone inválido');
    }
    if (opts?.source === 'provider') {
      throw new BadRequestException('Updates suportam apenas fonte local no momento');
    }
    const limit = Math.max(1, Math.min(1000, opts?.limit ?? 50));
    const instanceCandidates = opts?.instanceId ? await this.resolveInstanceCandidates(userId, opts.instanceId) : [];
    const afterTimestamp = this.parseDateOrNull(opts?.afterTimestamp);
    const afterUpdatedAt = this.parseDateOrNull(opts?.afterUpdatedAt);

    const basePhoneWhere = {
      OR: [
        { phoneRaw: normalized },
        { remoteJid: `${normalized}@s.whatsapp.net` },
        { remoteJidAlt: `${normalized}@s.whatsapp.net` }
      ]
    };

    const cursorWhere: any[] = [];
    if (afterTimestamp) cursorWhere.push({ timestamp: { gt: afterTimestamp } });
    if (afterUpdatedAt) cursorWhere.push({ updatedAt: { gt: afterUpdatedAt } });

    const where: any = {
      userId,
      ...basePhoneWhere,
      ...(instanceCandidates.length ? { instanceId: { in: instanceCandidates } } : {}),
      ...(cursorWhere.length ? { AND: [{ OR: cursorWhere }] } : {})
    };

    const records = await (this.prisma as any).whatsappMessage.findMany({
      where,
      orderBy: [{ timestamp: 'asc' }, { updatedAt: 'asc' }],
      take: limit
    });

    const data = (Array.isArray(records) ? records : []).map((m: any) => ({
      id: m.wamid ?? m.id,
      wamid: m.wamid ?? null,
      fromMe: !!m.fromMe,
      direction: m.direction ?? (m.fromMe ? 'OUTBOUND' : 'INBOUND'),
      conversation: m.conversation ?? null,
      caption: m.caption ?? null,
      mediaUrl: m.mediaUrl ?? null,
      messageType: m.messageType ?? null,
      deliveryStatus: m.deliveryStatus ?? null,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp).toISOString(),
      updatedAt: m.updatedAt instanceof Date ? m.updatedAt.toISOString() : new Date(m.updatedAt).toISOString(),
      pushName: m.pushName ?? null,
      phoneRaw: normalized
    })).filter((entry: any) => !!(entry.conversation || entry.caption || entry.mediaUrl || entry.messageType));

    const lastTimestamp = data.length ? data[data.length - 1].timestamp : (afterTimestamp ? afterTimestamp.toISOString() : new Date(0).toISOString());
    const lastUpdatedAt = data.reduce((acc: string, it: any) => (it.updatedAt > acc ? it.updatedAt : acc), afterUpdatedAt ? afterUpdatedAt.toISOString() : new Date(0).toISOString());

    return {
      data,
      cursor: {
        lastTimestamp,
        lastUpdatedAt
      }
    };
  }

  async listChats(userId: string, opts?: { instanceId?: string; limit?: number; source?: 'provider' | 'local' }) {
    let items: any[] = [];
    const instanceMeta = await this.getInstanceMetaMap(userId);
    const requestedInstancePublicId = opts?.instanceId ? (instanceMeta.get(opts.instanceId)?.publicId ?? opts.instanceId) : null;
    const requestedInstanceCandidates = opts?.instanceId ? await this.resolveInstanceCandidates(userId, opts.instanceId) : [];
    const useProvider = opts?.source === 'provider'
      ? true
      : opts?.source === 'local'
      ? false
      : (process.env.EVOLUTION_PROVIDER_READ ?? 'false').toLowerCase() === 'true';
    if (useProvider) {
      let lastError: unknown = null;
      const instanceCandidates = await this.resolveInstanceCandidates(userId, opts?.instanceId);
      const startedAt = Date.now();
      for (const instanceId of instanceCandidates) {
        try {
          const token = await this.resolveToken(userId, instanceId);
          const providerInstanceName = await this.evolution.resolveInstanceName(instanceId);
          const originInstanceId = instanceMeta.get(instanceId)?.publicId ?? instanceId;
          let provider: any = null;
          try {
            provider = await this.evolution.findChats({
              instanceId: providerInstanceName,
              where: {},
              limit: Math.max(10, Math.min(2000, opts?.limit ?? 500)),
              token: token ?? undefined
            });
          } catch (e) {
            provider = await this.evolution.listChats({
              instanceId: providerInstanceName,
              limit: Math.max(10, Math.min(2000, opts?.limit ?? 500)),
              token: token ?? undefined
            });
          }
          const got = Array.isArray((provider as any)?.chats)
            ? (provider as any).chats
            : Array.isArray((provider as any)?.data)
            ? (provider as any).data
            : Array.isArray(provider)
            ? provider
            : (provider as any)?.records ?? [];
          const annotated = (Array.isArray(got) ? got : []).map((c: any) =>
            c && typeof c === 'object' ? { ...c, __originInstanceId: originInstanceId } : c
          );
          items = [...items, ...annotated];
          lastError = null;
          if (opts?.instanceId) break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) {
        const status = lastError instanceof HttpException ? lastError.getStatus() : null;
        this.logger.warn(
          `Falha ao listar chats no provider; usando fallback local. userId=${userId} instanceId=${opts?.instanceId ?? 'auto'} status=${status ?? 'unknown'} durationMs=${Date.now() - startedAt}`
        );
        items = [];
      }
    }
    const shouldIncludeLocal = !useProvider || opts?.source === 'local' || !!opts?.instanceId || items.length === 0;
    if (shouldIncludeLocal) {
      const localChats = await this.readLocalChatsCached(userId, opts?.limit ?? 500, {
        instanceIds: requestedInstanceCandidates.length ? requestedInstanceCandidates : undefined
      });
      if (localChats.length) {
        items = [...items, ...localChats];
      }
    }
    const dataRaw = items
      .map((c: any) => {
        const jidRaw = [
          c?.remoteJid,
          c?.jid,
          c?.chatId,
          c?.id,
          c?.key?.remoteJid,
          c?.lastMessage?.key?.remoteJid,
          c?.lastMessage?.remoteJid,
          c?.phoneRaw
        ]
          .map((v: any) => (typeof v === 'string' ? v.trim() : ''))
          .find((v: string) => v.length > 0) ?? '';
        if (jidRaw.includes('@') && !jidRaw.endsWith('@s.whatsapp.net')) return null;
        const left = jidRaw.includes('@') ? jidRaw.split('@')[0] : jidRaw;
        const normalized = left ? left.replace(/\D+/g, '') : null;
        if (!normalized || normalized.length < 7 || normalized.length > 15) return null;
        const last = c?.lastMessage ?? c?.message ?? {};
        const lastText = last?.conversation ?? last?.message?.conversation ?? last?.extendedTextMessage?.text ?? last?.imageMessage?.caption ?? null;
        const lastTs = last?.messageTimestamp ?? last?.timestamp ?? c?.timestamp ?? null;
        const remoteJid = String(c?.remoteJid ?? c?.jid ?? '').trim() || (normalized ? `${normalized}@s.whatsapp.net` : '');
        const avatarUrl = (typeof c?.profilePicUrl === 'string' && c.profilePicUrl.trim())
          ? c.profilePicUrl.trim()
          : (typeof c?.profilePictureUrl === 'string' && c.profilePictureUrl.trim())
            ? c.profilePictureUrl.trim()
            : (typeof c?.picUrl === 'string' && c.picUrl.trim())
              ? c.picUrl.trim()
              : null;
        const tsIso = (() => {
          if (!lastTs) return null;
          const n = Number(lastTs);
          if (Number.isFinite(n) && n > 0) {
            const ms = n > 10_000_000_000 ? n : n * 1000;
            const dt = new Date(ms);
            return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
          }
          const dt = new Date(String(lastTs));
          return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
        })();
        const originInstanceId = this.extractOriginInstanceId(c) ?? requestedInstancePublicId;
        const originMeta = originInstanceId ? instanceMeta.get(originInstanceId) ?? null : null;
        const originLabel = originMeta?.number ?? originMeta?.publicId ?? (originInstanceId ? originInstanceId : 'unknown');
        return {
          id: c?.id ?? normalized ?? Math.random().toString(36).slice(2),
          name: c?.pushName ?? c?.name ?? null,
          contact: normalized,
          remoteJid,
          avatarUrl,
          originInstanceId: originInstanceId ?? 'unknown',
          originNumber: originMeta?.number ?? null,
          originProfilePicUrl: originMeta?.profilePicUrl ?? null,
          originLabel,
          lastMessage: lastText ? { text: lastText, timestamp: tsIso ?? new Date().toISOString(), fromMe: !!(last?.key?.fromMe) } : null
        };
      })
      .filter((x: any) => !!x?.contact);

    const byKey = new Map<string, any>();
    const buildKey = (row: any) => {
      const contact = String(row?.contact ?? '').trim();
      if (!contact) return '';
      if (opts?.instanceId) return contact;
      const origin = String(row?.originInstanceId ?? 'unknown').trim() || 'unknown';
      return `${contact}|${origin}`;
    };
    for (const row of dataRaw) {
      if (!row) continue;
      const key = buildKey(row);
      if (!key) continue;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, row);
        continue;
      }
      const a = prev?.lastMessage?.timestamp ? new Date(prev.lastMessage.timestamp).getTime() : 0;
      const b = row?.lastMessage?.timestamp ? new Date(row.lastMessage.timestamp).getTime() : 0;
      if ((Number.isFinite(b) ? b : 0) >= (Number.isFinite(a) ? a : 0)) {
        byKey.set(key, row);
      }
    }
    let data = Array.from(byKey.values());
    data.sort((a: any, b: any) => {
      const ta = a?.lastMessage?.timestamp ? new Date(a.lastMessage.timestamp).getTime() : 0;
      const tb = b?.lastMessage?.timestamp ? new Date(b.lastMessage.timestamp).getTime() : 0;
      return tb - ta;
    });

    data = await this.enrichChatAvatars(userId, data, { instanceId: opts?.instanceId });

    const contacts = data.map((d: any) => d.contact).filter(Boolean);
    if (contacts.length) {
      const leads = await (this.prisma as any).lead.findMany({
        where: { userId, contact: { in: contacts } },
        select: { contact: true, name: true }
      });
      const nameByContact = new Map<string, string>();
      for (const l of leads ?? []) {
        const c = typeof l?.contact === 'string' ? l.contact.replace(/\D+/g, '') : null;
        const n = typeof l?.name === 'string' ? l.name.trim() : '';
        if (c && n) nameByContact.set(c, n);
      }
      return data.map((d: any) => ({ ...d, name: nameByContact.get(d.contact) ?? d.name }));
    }
    return data;
  }

  private async enrichChatAvatars(userId: string, items: any[], opts?: { instanceId?: string }) {
    const candidates = (Array.isArray(items) ? items : [])
      .filter((c: any) => !c?.avatarUrl && typeof c?.remoteJid === 'string' && c.remoteJid.includes('@'))
      .slice(0, 20);
    if (!candidates.length) return items;
    await Promise.all(
      candidates.map(async (c: any) => {
        try {
          const url = await this.getProfilePicUrl(userId, { jid: c.remoteJid, instanceId: opts?.instanceId });
          if (url) c.avatarUrl = url;
        } catch {}
      })
    );
    return items;
  }

  private async validateMedia(url: string): Promise<{ ok: boolean; mediaType: 'image' | 'video' | 'document' }> {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      if (!resp.ok) return { ok: false, mediaType: 'document' };
      const type = resp.headers.get('content-type') || '';
      const len = parseInt(resp.headers.get('content-length') || '0', 10);
      const allowed = type.startsWith('image/') || type.startsWith('application/') || type.startsWith('video/');
      const max = 10 * 1024 * 1024;
      const mediaType = type.startsWith('image/')
        ? 'image'
        : type.startsWith('video/')
          ? 'video'
          : 'document';
      return { ok: allowed && (!len || len <= max), mediaType };
    } catch {
      return { ok: false, mediaType: 'document' };
    }
  }

  private async resolveToken(userId: string, instanceId?: string | null): Promise<string | null> {
    const where: any = instanceId
      ? { userId, OR: [{ instanceId }, { providerInstanceId: instanceId }] }
      : { userId };
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

  private uniqueStrings(values: Array<string | null | undefined>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of values) {
      if (!v) continue;
      const s = String(v).trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }

  private async resolveInstanceCandidates(userId: string, requestedInstanceId?: string): Promise<string[]> {
    const requested = (requestedInstanceId ?? '').trim();
    if (requested) {
      const record = await (this.prisma as any).evolutionInstance.findFirst({
        where: {
          userId,
          OR: [{ instanceId: requested }, { providerInstanceId: requested }]
        },
        select: { instanceId: true, providerInstanceId: true }
      });
      return this.uniqueStrings([requested, record?.instanceId, record?.providerInstanceId]);
    }
    const model = (this.prisma as any).evolutionInstance;
    if (typeof model?.findMany === 'function') {
      const records = await model.findMany({
        where: { userId },
        orderBy: [{ updatedAt: 'desc' }],
        select: { instanceId: true, providerInstanceId: true }
      });
      const values: Array<string | null | undefined> = [];
      for (const r of records ?? []) {
        values.push(r?.instanceId);
        values.push(r?.providerInstanceId);
      }
      return this.uniqueStrings(values);
    }
    const record = await model.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { instanceId: true, providerInstanceId: true }
    });
    return this.uniqueStrings([record?.instanceId, record?.providerInstanceId]);
  }

  private async readLocalConversationAsProviderItems(
    userId: string,
    normalizedPhone: string,
    limit: number,
    opts?: { beforeTimestamp?: Date | null; beforeUpdatedAt?: Date | null; instanceIds?: string[] }
  ): Promise<any[]> {
    const cursorWhere: any[] = [];
    if (opts?.beforeTimestamp) cursorWhere.push({ timestamp: { lt: opts.beforeTimestamp } });
    if (opts?.beforeUpdatedAt) cursorWhere.push({ updatedAt: { lt: opts.beforeUpdatedAt } });
    const local = await (this.prisma as any).whatsappMessage.findMany({
      where: {
        userId,
        OR: [
          { phoneRaw: normalizedPhone },
          { remoteJid: `${normalizedPhone}@s.whatsapp.net` },
          { remoteJidAlt: `${normalizedPhone}@s.whatsapp.net` }
        ],
        ...(opts?.instanceIds?.length ? { instanceId: { in: opts.instanceIds } } : {}),
        ...(cursorWhere.length ? { AND: [{ OR: cursorWhere }] } : {})
      },
      orderBy: [{ timestamp: 'desc' }, { updatedAt: 'desc' }],
      take: limit
    });
    local.reverse();
    return Array.isArray(local)
      ? local.map((m: any) => ({
          id: m.wamid ?? `${normalizedPhone}-${m.timestamp?.getTime?.() ?? Date.now()}`,
          key: { id: m.wamid ?? null, fromMe: !!m.fromMe },
          __originInstanceId: this.extractOriginInstanceId(m),
          message: m.mediaUrl
            ? { imageMessage: { url: m.mediaUrl, caption: m.caption ?? null } }
            : { conversation: m.conversation ?? null },
          messageType: m.messageType ?? (m.mediaUrl ? 'media' : (m.conversation ? 'text' : null)),
          deliveryStatus: m.deliveryStatus ?? null,
          messageTimestamp: Math.floor(
            (m.timestamp instanceof Date ? m.timestamp.getTime() : new Date(m.timestamp).getTime()) / 1000
          ),
          pushName: m.pushName ?? null
        }))
      : [];
  }

  private async readLocalChatsAsProviderItems(userId: string, limit: number, opts?: { instanceIds?: string[] }): Promise<any[]> {
    const take = Math.max(10, Math.min(2000, limit));
    const model = (this.prisma as any).whatsappMessage;
    const rows = await model.findMany({
      where: {
        userId,
        remoteJid: { endsWith: '@s.whatsapp.net' },
        ...(opts?.instanceIds?.length ? { instanceId: { in: opts.instanceIds } } : {})
      },
      orderBy: [{ timestamp: 'desc' }, { updatedAt: 'desc' }],
      take: Math.max(200, Math.min(5000, take * 10))
    });
    const seen = new Set<string>();
    const items: any[] = [];
    for (const m of rows ?? []) {
      const phone =
        String(m?.phoneRaw ?? '').replace(/\D+/g, '') ||
        String(m?.remoteJid ?? '').replace('@s.whatsapp.net', '').replace(/\D+/g, '');
      if (!phone || phone.length < 7 || phone.length > 15) continue;
      const originInstanceId = this.extractOriginInstanceId(m);
      const key = `${phone}|${originInstanceId ?? 'unknown'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: m.wamid ?? `${phone}-${originInstanceId ?? 'unknown'}`,
        remoteJid: `${phone}@s.whatsapp.net`,
        pushName: m.pushName ?? null,
        __originInstanceId: originInstanceId,
        lastMessage: {
          message: m.mediaUrl ? { imageMessage: { caption: m.caption ?? null } } : { conversation: m.conversation ?? null },
          messageTimestamp: Math.floor(
            (m.timestamp instanceof Date ? m.timestamp.getTime() : new Date(m.timestamp).getTime()) / 1000
          ),
          key: { fromMe: !!m.fromMe }
        }
      });
      if (items.length >= take) break;
    }
    return items;
  }

  private extractProviderConversationItems(provider: unknown): any[] {
    const p: any = provider ?? {};
    const candidates = [
      p?.messages?.records,
      p?.messages,
      p?.records,
      p?.data,
      p?.items
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) return c;
    }
    return [];
  }

  private extractProviderNextCursor(provider: unknown): string | null {
    const p: any = provider ?? {};
    const candidates = [
      p?.nextCursor,
      p?.cursor,
      p?.pageCursor,
      p?.nextPageCursor,
      p?.paging?.next,
      p?.pagination?.cursor,
      p?.messages?.nextCursor,
      p?.messages?.cursor
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
      if (typeof c === 'number' && Number.isFinite(c)) return String(c);
    }
    return null;
  }

  private parseDateOrNull(value: string | undefined): Date | null {
    const raw = (value ?? '').trim();
    if (!raw) return null;
    const fromNumber = Number(raw);
    if (Number.isFinite(fromNumber) && fromNumber > 0) {
      const ms = fromNumber > 10_000_000_000 ? fromNumber : fromNumber * 1000;
      const dt = new Date(ms);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
}
