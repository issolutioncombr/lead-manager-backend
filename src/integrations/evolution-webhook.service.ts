import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EvolutionWebhookService {
  private readonly logger = new Logger(EvolutionWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleWebhook(payload: any) {
    // 1. Validar se é um evento de mensagem
    if (payload.event !== 'messages.upsert') {
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
      select: { userId: true }
    });

    if (instanceRecord) {
      userId = instanceRecord.userId;
    } else {
      // Fallback: Tenta achar um usuário que tenha esse nome de instância em algum lugar
      // Ou loga erro. Sem userId não podemos salvar (constraint de FK).
      this.logger.warn(`Webhook recebido de instância desconhecida: ${instanceName} / ${providerInstanceId}`);
      return;
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
    const ctx = message?.messageContextInfo || contextInfo; // Às vezes vem fora
    // No exemplo do usuário está em `data.message.contextInfo` e `data.contextInfo`?
    // O exemplo mostra `data.contextInfo` com `conversionSource`.
    
    const attributionData = data.contextInfo || {};
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

    // 6. Salvar no Banco (Create only - Append Log)
    try {
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
          adSourceType: externalAdReply.sourceType,
          adSourceId: externalAdReply.sourceId,
          adSourceUrl: externalAdReply.sourceUrl,
          ctwaClid: externalAdReply.ctwaClid,
          sourceApp: externalAdReply.sourceApp,
          
          conversionSource: attributionData.conversionSource,
          entryPointConversionSource: attributionData.entryPointConversionSource,
          entryPointConversionApp: attributionData.entryPointConversionApp,

          // Enriquecimento (Meta CAPI)
          hashedPhone,
          hashedFirstName,
          hashedLastName,
          eventName: 'Lead', // Default inicial, pode ser atualizado ou inserido novo evento depois
          messagingChannel: 'WhatsApp',
          originPlatform: 'WhatsApp',
          
          rawJson: payload
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
}
