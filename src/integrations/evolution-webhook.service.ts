import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EvolutionWebhookService {
  private readonly logger = new Logger(EvolutionWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    const phoneRaw = this.normalizePhone(remoteJid);
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

      await (this.prisma as any).whatsappMessage.upsert({
        where: { wamid },
        create: {
          userId,
          wamid,
          remoteJid,
          remoteJidAlt: remoteJid,
          phoneRaw,
          fromMe,
          direction,
          pushName: typeof pushName === 'string' ? pushName : null,
          sender: payload?.body?.sender ?? null,
          addressingMode: key?.addressingMode ?? null,
          participant: key?.participant ?? null,
          timestamp: messageTimestamp ? new Date(messageTimestamp * 1000) : new Date(),
          status: data?.status ?? null,
          messageType,
          conversation: conversationText ?? null,
          caption: mediaCaption,
          mediaUrl,
          rawJson: this.redactSecrets(payload)
        },
        update: {
          fromMe,
          direction,
          messageType,
          conversation: conversationText ?? null,
          caption: mediaCaption,
          mediaUrl,
          status: data?.status ?? null,
          rawJson: this.redactSecrets(payload)
        }
      });

      const n8nUrl = (process.env.N8N_WEBHOOK_URL ?? '').trim();
      if (n8nUrl) {
        const userApiKey = await (this.prisma as any).user.findUnique({
          where: { id: userId },
          select: { apiKey: true }
        });

        const outbound = {
          jsonrow,
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
              messageType,
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

        try {
          const resp = await fetch(n8nUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(outbound)
          });
          if (resp.ok) {
            await (this.prisma as any).webhook.update({
              where: { id: createdWebhook.id },
              data: { status: 'sent', sentAt: new Date() }
            });
          }
        } catch (err) {
          this.logger.warn(`Falha ao enviar webhook ao N8N: ${err}`);
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
    const phone = cleanPhone(data?.key?.remoteJid);
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
}
