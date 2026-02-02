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

    if (userId) {
      const mapData: any = {
        userId,
        phoneRaw,
        instanceId: instanceRecord?.instanceId ?? instanceName ?? '',
        providerInstanceId: instanceRecord?.providerInstanceId ?? providerInstanceId ?? null,
        slotId,
        webhookUrl:
          instanceRecord?.metadata && typeof instanceRecord.metadata === 'object'
            ? (instanceRecord.metadata as any)?.webhookUrl ?? null
            : null
      };

      await (this.prisma as any).whatsappPhoneInstance.upsert({
        where: { phoneRaw },
        update: mapData,
        create: mapData
      });
    }

    // 7. Registrar Webhook bruto
    if (userId) {
      await (this.prisma as any).webhook.create({
        data: {
          userId,
          instanceId: instanceRecord?.instanceId ?? instanceName ?? null,
          providerInstanceId: instanceRecord?.providerInstanceId ?? providerInstanceId ?? null,
          slotId,
          phoneRaw,
          receivedAt: new Date(),
          rawJson: payload
        }
      });
    }

    // 8. Salvar no Banco (Create only - Append Log)
    try {
      const safePayload = this.redactSecrets(payload);
      // Cast para any para evitar erro de tipo temporário do Prisma
      await (this.prisma as any).whatsappMessage.create({
        data: {
          userId,
          wamid,
          remoteJid,
          phoneRaw,
          pushName,
          fromMe,
          timestamp: new Date(messageTimestamp * 1000), // Timestamp vem em segundos
          status: data.status,
          messageType: messageType || Object.keys(message || {})[0],
          conversation: conversationText,
          
          // Atribuição
          isAd,
          adTitle: externalAdReply.title,
          adBody: externalAdReply.body,
          adMediaType: externalAdReply.mediaType,
          adThumbnailUrl: externalAdReply.thumbnailUrl,
          adOriginalImageUrl: externalAdReply.originalImageUrl,
          adSourceType: externalAdReply.sourceType,
          adSourceId: externalAdReply.sourceId,
          adSourceUrl: externalAdReply.sourceUrl,
          ctwaClid: externalAdReply.ctwaClid,
          sourceApp: externalAdReply.sourceApp ?? attributionData.sourceApp ?? data.sourceApp ?? payload.sourceApp,
          
          conversionSource: attributionData.conversionSource,
          entryPointConversionSource: attributionData.entryPointConversionSource,
          entryPointConversionApp: attributionData.entryPointConversionApp,

          eventType: normalizedEvent,

          // Enriquecimento (Meta CAPI)
          hashedPhone,
          hashedFirstName,
          hashedLastName,
          eventName: 'Lead', // Default inicial, pode ser atualizado ou inserido novo evento depois
          messagingChannel: 'WhatsApp',
          originPlatform: 'WhatsApp',
          instance: instanceName,
          instanceId: instanceRecord?.instanceId ?? providerInstanceId ?? null,
          slotId,
          
          rawJson: safePayload
        }
      });
      
      this.logger.log(`Mensagem salva: ${wamid} (User: ${userId})`);

    } catch (error: any) {
      if (error.code === 'P2002') {
        this.logger.debug(`Mensagem duplicada ignorada: ${wamid}`);
      } else {
        this.logger.error(`Erro ao salvar mensagem: ${error.message}`, error.stack);
        throw error;
      }
    }

    // 9. Criar lead se não existir
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
