import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import https from 'node:https';
import { MessageEventsService } from './message-events.service';

@Injectable()
export class EvolutionWebhookService {
  private readonly logger = new Logger(EvolutionWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: MessageEventsService
  ) {}

  async handleConnectionUpdate(payload: any) {
    const instanceName = payload?.instance ?? null;
    let userId: string | null = null;
    let instanceId: string | null = null;
    let providerInstanceId: string | null = null;
    if (instanceName) {
      const instanceRecord = await this.prisma.evolutionInstance.findFirst({
        where: {
          OR: [
            { providerInstanceId: instanceName },
            { metadata: { path: ['displayName'], equals: instanceName } },
            { metadata: { path: ['instanceName'], equals: instanceName } }
          ]
        },
        select: { userId: true, instanceId: true, providerInstanceId: true }
      });
      if (instanceRecord) {
        userId = instanceRecord.userId;
        instanceId = instanceRecord.instanceId;
        providerInstanceId = instanceRecord.providerInstanceId;
      }
    }
    if (!userId) {
      return;
    }
    const created = await (this.prisma as any).webhook.create({
      data: {
        userId,
        instanceId,
        providerInstanceId,
        receivedAt: new Date(),
        rawJson: this.redactSecrets(payload),
        jsonrow: {
          eventType: payload?.event ?? 'connection.update',
          state: payload?.data?.state ?? null,
          statusReason: payload?.data?.statusReason ?? null,
          wuid: payload?.data?.wuid ?? null,
          instance: instanceName ?? null,
          serverUrl: payload?.server_url ?? null
        }
      }
    });
    const n8nUrl = (process.env.N8N_WEBHOOK_URL ?? '').trim();
    if (n8nUrl) {
      const outbound = {
        event: 'connection.update',
        instance: {
          userId,
          instanceId,
          providerInstanceId
        },
        data: {
          state: payload?.data?.state ?? null,
          statusReason: payload?.data?.statusReason ?? null,
          wuid: payload?.data?.wuid ?? null
        }
      };
      await (this.prisma as any).webhook.update({
        where: { id: created.id },
        data: { outboundJson: this.redactSecrets(outbound), outboundUrl: n8nUrl }
      });
      const ok = await this.postJson(n8nUrl, outbound);
      if (ok.ok) {
        await (this.prisma as any).webhook.update({
          where: { id: created.id },
          data: { status: 'sent', sentAt: new Date() }
        });
      }
    }
  }

  async handleWebhook(payload: any) {
    // 1. Validar se é um evento de mensagem
    const eventRaw = (payload?.event ?? payload?.eventType ?? '').toString();
    const normalizedEvent = eventRaw.toLowerCase().replace(/_/g, '.');

    if (normalizedEvent !== 'messages.upsert') {
      return;
    }

    const { instance, data } = payload;
    const { key, message, contextInfo, messageTimestamp, pushName, messageType } = data;

    // 2. Encontrar o usuário dono da instância
    // Tenta pelo nome da instância ou pelo ID (se disponível no payload)
    // O payload do exemplo tem "instance": "Whatsapp IA 8741" e "instanceId": "..."
    const instanceName = instance;
    const providerInstanceId = data.instanceId; // Payload example shows instanceId inside data too? No, it's inside body.

    // O payload recebido tem "instance" no nível superior e "instanceId" dentro de "data" no exemplo do usuário?
    // User example:
    // body: { event: "...", instance: "...", data: { key: ..., instanceId: "..." } }
    // Vamos usar o que vier.

    let userId: string | null = null;

    // Busca por metadados da instância (onde salvamos o nome)
    // A tabela EvolutionInstance tem `metadata` que é JSON.
    // Mas também tem `instanceId` (nosso ID interno) e `providerInstanceId`.
    // Vamos tentar buscar pelo providerInstanceId primeiro.

    const instanceRecord = await this.prisma.evolutionInstance.findFirst({
      where: {
        OR: [
          { providerInstanceId: providerInstanceId },
          // Se não achar pelo ID, tenta pelo nome no metadata (muito comum na Evolution)
          { metadata: { path: ['displayName'], equals: instanceName } },
          { metadata: { path: ['instanceName'], equals: instanceName } }
        ]
      },
      select: { userId: true, instanceId: true, providerInstanceId: true, metadata: true }
    });

    if (instanceRecord) {
      userId = instanceRecord.userId;
    } else {
      // Fallback: tenta identificar o usuário pelo apiKey presente no payload
      const apiKeyFromPayload: string | undefined = payload?.body?.apikey ?? payload?.apikey;
      if (apiKeyFromPayload && typeof apiKeyFromPayload === 'string' && apiKeyFromPayload.length > 0) {
        const user = await (this.prisma as any).user.findFirst({
          where: { apiKey: apiKeyFromPayload }
        });
        if (user?.id) {
          userId = user.id as string;
          this.logger.warn(
            `Webhook sem instancia mapeada; usuario identificado por apiKey. instance=${instanceName} providerInstanceId=${providerInstanceId}`
          );
        }
      }
      // Se ainda não houver userId, registra aviso e segue sem persistir (evita dados órfãos)
      if (!userId) {
        this.logger.warn(
          `Webhook recebido sem instancia conhecida e sem apiKey associada: instance=${instanceName} providerInstanceId=${providerInstanceId}`
        );
        return;
      }
    }

    // 3. Extrair dados da mensagem
    const wamid = key.id;
    const remoteJid = key.remoteJid;
    const remoteJidAlt = key.remoteJidAlt ?? null;
    const fromMe = key.fromMe;
    
    // Extração do texto (conversation)
    let conversationText = message?.conversation;
    if (!conversationText && message?.extendedTextMessage?.text) {
      conversationText = message.extendedTextMessage.text;
    } else if (!conversationText && message?.imageMessage?.caption) {
      conversationText = message.imageMessage.caption;
    }

    // 4. Extrair dados de atribuição (CTWA)
    const ctx =
      contextInfo ??
      message?.contextInfo ??
      message?.extendedTextMessage?.contextInfo ??
      message?.imageMessage?.contextInfo ??
      message?.videoMessage?.contextInfo ??
      message?.documentMessage?.contextInfo ??
      message?.stickerMessage?.contextInfo ??
      message?.audioMessage?.contextInfo ??
      message?.buttonsResponseMessage?.contextInfo ??
      message?.listResponseMessage?.contextInfo;

    const attributionData = ctx ?? data.contextInfo ?? {};
    const externalAdReply = attributionData.externalAdReply || {};

    const isAd = attributionData.conversionSource === 'FB_Ads' || !!externalAdReply.sourceId;
    
    // 5. Normalização e Hashing
    const phoneRaw = this.getNormalizedPhone(key);
    const hashedPhone = this.hashData(phoneRaw);
    
    // Tenta extrair primeiro e último nome do pushName (heurística simples)
    let hashedFirstName: string | null = null;
    let hashedLastName: string | null = null;
    if (pushName) {
      const parts = pushName.trim().split(/\s+/);
      if (parts.length > 0) {
        hashedFirstName = this.hashData(parts[0]);
        if (parts.length > 1) {
          hashedLastName = this.hashData(parts[parts.length - 1]);
        }
      }
    }

    // 6. Determinar slotId e atualizar mapeamento por número
    const slotId =
      instanceRecord?.metadata && typeof instanceRecord.metadata === 'object'
        ? (instanceRecord.metadata as any)?.slotId ?? null
        : null;

    // 7. Registrar Webhook bruto
    if (userId) {
      const jsonrow = this.buildJsonRow(payload);
      const createdWebhook = await (this.prisma as any).webhook.create({
        data: {
          userId,
          instanceId: instanceRecord?.instanceId ?? instanceName ?? null,
          providerInstanceId: instanceRecord?.providerInstanceId ?? providerInstanceId ?? null,
          slotId,
          phoneRaw,
          receivedAt: new Date(),
          rawJson: payload,
          jsonrow
        }
      });

      const direction = fromMe ? 'OUTBOUND' : 'INBOUND';
      const mediaCaption = message?.imageMessage?.caption || message?.videoMessage?.caption || message?.documentMessage?.caption || null;
      const mediaUrl = message?.imageMessage?.url || message?.videoMessage?.url || message?.documentMessage?.url || null;
      const resolvedMessageType =
        typeof messageType === 'string' && messageType.length > 0
          ? messageType
          : this.detectMessageType(message);

      await (this.prisma as any).whatsappMessage.upsert({
        where: { wamid },
        create: {
          userId,
          wamid,
          remoteJid,
          remoteJidAlt: remoteJidAlt ?? remoteJid,
          phoneRaw,
          fromMe,
          direction,
          pushName: typeof pushName === 'string' ? pushName : null,
          sender: payload?.body?.sender ?? null,
          addressingMode: key?.addressingMode ?? null,
          participant: key?.participant ?? null,
          timestamp: messageTimestamp ? new Date(messageTimestamp * 1000) : new Date(),
          status: data?.status ?? null,
          messageType: resolvedMessageType ?? null,
          conversation: conversationText ?? null,
          caption: mediaCaption,
          mediaUrl,
          rawJson: this.redactSecrets(payload)
        },
        update: {
          fromMe,
          direction,
          remoteJidAlt: remoteJidAlt ?? remoteJid,
          messageType: resolvedMessageType ?? null,
          conversation: conversationText ?? null,
          caption: mediaCaption,
          mediaUrl,
          status: data?.status ?? null,
          rawJson: this.redactSecrets(payload)
        }
      });

      if (phoneRaw) {
        this.events.emit({
          userId,
          phoneRaw,
          event: 'messages.upsert',
          wamid
        });
      }

      const n8nUrl = (process.env.N8N_WEBHOOK_URL ?? '').trim();
      if (n8nUrl) {
        const userApiKey = await (this.prisma as any).user.findUnique({
          where: { id: userId },
          select: { apiKey: true, companyName: true }
        });

        const fromNumber = fromMe ? (payload?.body?.sender ?? null) : phoneRaw;
        const outbound = {
          jsonrow,
          user_id: userId,
          company_id: null,
          company_name: userApiKey?.companyName ?? null,
          instance_id: createdWebhook.instanceId,
          from_number: fromNumber,
          instance: {
            userId,
            instanceId: createdWebhook.instanceId,
            providerInstanceId: createdWebhook.providerInstanceId,
            apiKey: userApiKey?.apiKey ?? null
          },
          webhooks: [
            {
              instance: instanceName ?? createdWebhook.instanceId,
              instanceId: providerInstanceId ?? createdWebhook.providerInstanceId,
              number: phoneRaw,
              id: wamid,
              fromMe,
              conversation: conversationText,
              messageType: resolvedMessageType ?? null,
              name: typeof pushName === 'string' ? pushName : null,
              timestamp: messageTimestamp?.toString() ?? null
            }
          ]
        };

        await (this.prisma as any).webhook.update({
          where: { id: createdWebhook.id },
          data: {
            outboundJson: this.redactSecrets(outbound),
            outboundUrl: n8nUrl
          }
        });

        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const ok = await this.postJson(n8nUrl, outbound);
          if (ok.ok) {
            await (this.prisma as any).webhook.update({
              where: { id: createdWebhook.id },
              data: { status: 'sent', sentAt: new Date() }
            });
            break;
          }
          if (attempt < maxAttempts) {
            const waitMs = 300 * attempt;
            await new Promise((r) => setTimeout(r, waitMs));
          } else {
            this.logger.warn('Falha ao enviar webhook ao N8N após retries');
          }
        }
      }
    }

    // 8. Criar lead se não existir
    if (userId && phoneRaw) {
      const existingLead = await (this.prisma as any).lead.findFirst({
        where: { userId, contact: phoneRaw }
      });
      if (!existingLead) {
        await (this.prisma as any).lead.create({
          data: {
            userId,
            source: 'WhatsApp',
            contact: phoneRaw,
            name: typeof pushName === 'string' ? pushName : null,
            notes: null,
            score: 0
          }
        });
      }
    }
  }

  private buildJsonRow(input: any): Record<string, any> {
    const body = input?.body ?? {};
    const data = body?.data ?? {};
    const cleanPhone = (jid: any) =>
      typeof jid === 'string' ? jid.replace('@s.whatsapp.net', '').replace(/\D+/g, '').trim() : null;
    const get = (fn: () => any, fallback: any = null) => {
      try {
        const v = fn();
        return v === undefined ? fallback : v;
      } catch {
        return fallback;
      }
    };
    if (!data?.key) return {};
    const phone = cleanPhone(data?.key?.remoteJidAlt ?? data?.key?.remoteJid);
    const msg = data?.message ?? {};
    const ctxMsg = msg?.messageContextInfo ?? {};
    const deviceMeta = ctxMsg?.deviceListMetadata ?? {};
    const contextInfo = data?.contextInfo ?? {};
    const ad = contextInfo?.externalAdReply ?? {};
    const messageText =
      msg?.conversation ??
      msg?.extendedTextMessage?.text ??
      msg?.imageMessage?.caption ??
      null;
    return {
      name: data?.pushName ?? null,
      contact: phone,
      source: 'WhatsApp',
      stage: 'Novo',
      wamid: data?.key?.id ?? null,
      remoteJid: data?.key?.remoteJid ?? null,
      remoteJidAlt: data?.key?.remoteJidAlt ?? data?.key?.remoteJid ?? null,
      fromMe: data?.key?.fromMe ?? null,
      addressingMode: data?.key?.addressingMode ?? null,
      participant: data?.key?.participant || null,
      status: data?.status ?? null,
      messageType: data?.messageType ?? null,
      messageTimestamp: data?.messageTimestamp ?? null,
      messageText,
      senderTimestamp: get(() => deviceMeta.senderTimestamp?.low),
      recipientTimestamp: get(() => deviceMeta.recipientTimestamp?.low),
      deviceSource: data?.source ?? null,
      instance: body?.instance ?? null,
      instanceId: data?.instanceId ?? null,
      sender: body?.sender ?? null,
      adSourceType: ad?.sourceType ?? null,
      adSourceId: ad?.sourceId ?? null,
      adSourceUrl: ad?.sourceUrl ?? null,
      sourceApp: ad?.sourceApp ?? null,
      ctwaClid: ad?.ctwaClid ?? null,
      containsAutoReply: ad?.containsAutoReply ?? null,
      renderLargerThumbnail: ad?.renderLargerThumbnail ?? null,
      showAdAttribution: ad?.showAdAttribution ?? null,
      automatedGreetingMessageShown: ad?.automatedGreetingMessageShown ?? null,
      greetingMessageBody: ad?.greetingMessageBody ?? null,
      wtwaAdFormat: ad?.wtwaAdFormat ?? null,
      adTitle: ad?.title ?? null,
      adBody: ad?.body ?? null,
      adThumbnailUrl: ad?.thumbnailUrl ?? null,
      adMediaType: ad?.mediaType ?? null,
      entryPointConversionSource: contextInfo?.entryPointConversionSource ?? null,
      entryPointConversionApp: contextInfo?.entryPointConversionApp ?? null,
      entryPointConversionExternalSource: contextInfo?.entryPointConversionExternalSource ?? null,
      entryPointConversionExternalMedium: contextInfo?.entryPointConversionExternalMedium ?? null,
      ctwaSignals: contextInfo?.ctwaSignals ?? null,
      destination: body?.destination ?? null,
      serverUrl: body?.server_url ?? null,
      apikey: body?.apikey ?? null,
      executionMode: input?.executionMode ?? null,
      receivedAt: body?.date_time ?? null,
      eventType: body?.event ?? null,
      adOriginalImageUrl: ad?.originalImageUrl ?? null,
      adRef: ad?.ref ?? null
    };
  }
  private normalizePhone(jid: string): string {
    // Remove @s.whatsapp.net e caracteres não numéricos
    return jid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  }

  private hashData(data: string | null | undefined): string | null {
    if (!data) return null;
    // Normalização Meta: lowercase, trim
    const normalized = data.trim().toLowerCase();
    return createHash('sha256').update(normalized).digest('hex');
  }

  private redactSecrets(value: any): any {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map((item) => this.redactSecrets(item));
    if (typeof value !== 'object') return value;

    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const key = k.toLowerCase();
      if (
        key === 'apikey' ||
        key === 'api_key' ||
        key === 'authorization' ||
        key === 'token' ||
        key === 'access_token' ||
        key === 'refresh_token' ||
        key.includes('secret')
      ) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = this.redactSecrets(v);
      }
    }
    return out;
  }

  private detectMessageType(msg: any): string | null {
    if (!msg || typeof msg !== 'object') return null;
    if (typeof msg.conversation === 'string') return 'conversation';
    if (msg.extendedTextMessage) return 'extendedTextMessage';
    if (msg.imageMessage) return 'imageMessage';
    if (msg.videoMessage) return 'videoMessage';
    if (msg.documentMessage) return 'documentMessage';
    if (msg.audioMessage) return 'audioMessage';
    if (msg.stickerMessage) return 'stickerMessage';
    if (msg.buttonsResponseMessage) return 'buttonsResponseMessage';
    if (msg.listResponseMessage) return 'listResponseMessage';
    if (msg.reactionMessage) return 'reactionMessage';
    return null;
  }

  async handleMessagesUpdate(payload: any) {
    const instanceName = payload?.instance ?? null;
    const data = payload?.data ?? {};
    const keyId = data?.keyId ?? data?.key?.id ?? null;
    const remoteJid = data?.remoteJid ?? data?.key?.remoteJid ?? null;
    const status = data?.status ?? null;
    const mapped =
      typeof status === 'string'
        ? (status.toUpperCase() === 'READ'
            ? 'READ'
            : status.toUpperCase() === 'DELIVERED' || status.toUpperCase() === 'DELIVERY_ACK' || status.toUpperCase() === 'SERVER_ACK'
            ? 'DELIVERED'
            : status.toUpperCase() === 'SENT'
            ? 'SENT'
            : status.toUpperCase() === 'FAILED'
            ? 'FAILED'
            : null)
        : null;
    let userId: string | null = null;
    let instanceId: string | null = null;
    let providerInstanceId: string | null = null;
    if (instanceName) {
      const instanceRecord = await this.prisma.evolutionInstance.findFirst({
        where: {
          OR: [
            { providerInstanceId: instanceName },
            { metadata: { path: ['displayName'], equals: instanceName } },
            { metadata: { path: ['instanceName'], equals: instanceName } }
          ]
        },
        select: { userId: true, instanceId: true, providerInstanceId: true }
      });
      if (instanceRecord) {
        userId = instanceRecord.userId;
        instanceId = instanceRecord.instanceId;
        providerInstanceId = instanceRecord.providerInstanceId;
      }
    }
    let updatedCount = 0;
    if (keyId) {
      const result = await (this.prisma as any).whatsappMessage.updateMany({
        where: { wamid: keyId },
        data: { deliveryStatus: mapped ?? null, status: status ?? null }
      });
      updatedCount = result?.count ?? 0;
    }
    if (userId) {
      await (this.prisma as any).webhook.create({
        data: {
          userId,
          instanceId,
          providerInstanceId,
          phoneRaw: remoteJid ? this.normalizePhone(remoteJid) : null,
          receivedAt: new Date(),
          rawJson: this.redactSecrets(payload),
          jsonrow: {
            eventType: payload?.event ?? 'messages.update',
            keyId,
            remoteJid,
            status
          }
        }
      });

      if (updatedCount === 0 && keyId) {
        this.logger.warn(`messages.update sem match por wamid; keyId=${keyId} remoteJid=${remoteJid ?? 'null'}`);
      }

      const p = remoteJid ? this.normalizePhone(remoteJid) : null;
      if (p) {
        this.events.emit({
          userId,
          phoneRaw: p,
          event: 'messages.update',
          wamid: keyId
        });
      }
    }
  }

  async handleContactsUpdate(payload: any) {
    const instanceName = payload?.instance ?? null;
    let userId: string | null = null;
    let instanceId: string | null = null;
    let providerInstanceId: string | null = null;
    if (instanceName) {
      const instanceRecord = await this.prisma.evolutionInstance.findFirst({
        where: {
          OR: [
            { providerInstanceId: instanceName },
            { metadata: { path: ['displayName'], equals: instanceName } },
            { metadata: { path: ['instanceName'], equals: instanceName } }
          ]
        },
        select: { userId: true, instanceId: true, providerInstanceId: true }
      });
      if (instanceRecord) {
        userId = instanceRecord.userId;
        instanceId = instanceRecord.instanceId;
        providerInstanceId = instanceRecord.providerInstanceId;
      }
    }
    const items = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
    if (userId) {
      for (const it of items) {
        const remoteJid = it?.remoteJid ?? null;
        await (this.prisma as any).webhook.create({
          data: {
            userId,
            instanceId,
            providerInstanceId,
            phoneRaw: remoteJid ? this.normalizePhone(remoteJid) : null,
            receivedAt: new Date(),
            rawJson: this.redactSecrets(payload),
            jsonrow: {
              eventType: payload?.event ?? 'contacts.update',
              remoteJid,
              pushName: it?.pushName ?? null,
              profilePicUrl: it?.profilePicUrl ?? null
            }
          }
        });
      }
    }
  }

  async handleChatsUpdate(payload: any) {
    const instanceName = payload?.instance ?? null;
    let userId: string | null = null;
    let instanceId: string | null = null;
    let providerInstanceId: string | null = null;
    if (instanceName) {
      const instanceRecord = await this.prisma.evolutionInstance.findFirst({
        where: {
          OR: [
            { providerInstanceId: instanceName },
            { metadata: { path: ['displayName'], equals: instanceName } },
            { metadata: { path: ['instanceName'], equals: instanceName } }
          ]
        },
        select: { userId: true, instanceId: true, providerInstanceId: true }
      });
      if (instanceRecord) {
        userId = instanceRecord.userId;
        instanceId = instanceRecord.instanceId;
        providerInstanceId = instanceRecord.providerInstanceId;
      }
    }
    const items = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
    if (userId) {
      for (const it of items) {
        const remoteJid = it?.remoteJid ?? null;
        await (this.prisma as any).webhook.create({
          data: {
            userId,
            instanceId,
            providerInstanceId,
            phoneRaw: remoteJid ? this.normalizePhone(remoteJid) : null,
            receivedAt: new Date(),
            rawJson: this.redactSecrets(payload),
            jsonrow: {
              eventType: payload?.event ?? 'chats.update',
              remoteJid,
              unreadMessages: it?.unreadMessages ?? null
            }
          }
        });
      }
    }
  }

  async handleChatsUpsert(payload: any) {
    return this.handleChatsUpdate(payload);
  }

  private async postJson(url: string, body: any): Promise<{ ok: boolean; status: number }> {
    const payload = JSON.stringify(body);
    const f: any = (global as any).fetch;
    if (typeof f === 'function') {
      try {
        const resp = await f(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
        return { ok: resp.ok, status: resp.status ?? 0 };
      } catch {
        return { ok: false, status: 0 };
      }
    }
    return await new Promise((resolve) => {
      try {
        const u = new URL(url);
        const req = https.request(
          {
            protocol: u.protocol,
            hostname: u.hostname,
            port: u.port ? Number(u.port) : undefined,
            path: u.pathname + (u.search ?? ''),
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          },
          (res) => {
            const code = res.statusCode ?? 0;
            resolve({ ok: code >= 200 && code < 300, status: code });
          }
        );
        req.on('error', () => resolve({ ok: false, status: 0 }));
        req.write(payload);
        req.end();
      } catch {
        resolve({ ok: false, status: 0 });
      }
    });
  }

  async dispatchByEvent(payload: any) {
    const raw = (payload?.event ?? '').toString();
    const normalized = raw.toLowerCase().replace(/_/g, '.').replace(/-/g, '.');
    if (normalized === 'messages.upsert') {
      return this.handleWebhook(payload);
    }
    if (normalized === 'connection.update') {
      return this.handleConnectionUpdate(payload);
    }
    if (normalized === 'messages.update') {
      return this.handleMessagesUpdate(payload);
    }
    if (normalized === 'contacts.update' || normalized === 'contacts.upsert' || normalized === 'contacts.set') {
      return this.handleContactsUpdate(payload);
    }
    if (normalized === 'chats.update' || normalized === 'chats.upsert' || normalized === 'chats.set' || normalized === 'chats.delete') {
      return this.handleChatsUpdate(payload);
    }
    const instanceName = payload?.instance ?? null;
    let userId: string | null = null;
    let instanceId: string | null = null;
    let providerInstanceId: string | null = null;
    if (instanceName) {
      const instanceRecord = await this.prisma.evolutionInstance.findFirst({
        where: {
          OR: [
            { providerInstanceId: instanceName },
            { metadata: { path: ['displayName'], equals: instanceName } },
            { metadata: { path: ['instanceName'], equals: instanceName } }
          ]
        },
        select: { userId: true, instanceId: true, providerInstanceId: true }
      });
      if (instanceRecord) {
        userId = instanceRecord.userId;
        instanceId = instanceRecord.instanceId;
        providerInstanceId = instanceRecord.providerInstanceId;
      }
    }
    if (userId) {
      await (this.prisma as any).webhook.create({
        data: {
          userId,
          instanceId,
          providerInstanceId,
          receivedAt: new Date(),
          rawJson: this.redactSecrets(payload),
          jsonrow: {
            eventType: raw || 'unknown',
            info: payload?.data ?? null
          }
        }
      });
    }
    return;
  }

  private getNormalizedPhone(key: any): string | null {
    const addressingMode = key?.addressingMode ?? '';
    const jid = key?.remoteJid ?? '';
    const alt = key?.remoteJidAlt ?? '';
    const candidate = (String(jid).includes('@lid') || addressingMode === 'lid') ? (alt || jid) : jid;
    const left = String(candidate).split('@')[0];
    const normalized = left.replace(/\D/g, '');
    return normalized || null;
  }
}
