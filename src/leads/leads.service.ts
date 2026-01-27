import { Injectable, NotFoundException, Logger, ConflictException } from '@nestjs/common';
import { Appointment, Lead, LeadStage, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

import { calculateLeadScore } from '../common/utils/lead-scoring.util';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsQuery, LeadsRepository, PaginatedLeads } from './leads.repository';
import { LeadStatusWebhookService } from './lead-status-webhook.service';

interface UpdateLeadOptions {
  relatedAppointment?: Appointment | null;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly leadsRepository: LeadsRepository,
    private readonly leadStatusWebhookService: LeadStatusWebhookService,
    private readonly prisma: PrismaService
  ) {}

  list(userId: string, query: LeadsQuery): Promise<PaginatedLeads> {
    return this.leadsRepository.findMany(userId, query);
  }

  async findById(userId: string, id: string) {
    const lead = await this.leadsRepository.findById(userId, id);

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado');
    }

    return lead;
  }

  async create(userId: string, dto: CreateLeadDto): Promise<Lead> {
    // Validação de Duplicidade por Telefone (se informado)
    if (dto.contact) {
      const existingLead = await this.prisma.lead.findFirst({
        where: {
          userId,
          contact: dto.contact
        }
      });
      
      if (existingLead) {
        throw new ConflictException(`Lead já existe com o telefone: ${dto.contact}`);
      }
    }

    const stage = dto.stage ?? LeadStage.NOVO;

    const score = calculateLeadScore({
      source: dto.source,
      stage
    });

    const data: Omit<Prisma.LeadUncheckedCreateInput, 'userId'> = {
      name: dto.name ?? undefined,
      email: dto.email ?? undefined,
      contact: dto.contact ?? undefined,
      source: dto.source ?? undefined,
      notes: dto.notes ?? undefined,
      stage,
      score
    };

    const createdLead = await this.leadsRepository.create(userId, data);

    // Lógica robusta para extrair dados do payload (suporta N8N aninhado em rawjson)
    const rawPayload = dto.rawJson || dto.rawjson; 
    
    // Identifica o wamid (ID da mensagem)
    const wamid = dto.wamid ?? rawPayload?.wamid ?? rawPayload?.key?.id;

    this.logger.log(`Payload recebido. Wamid detectado: ${wamid}. Tem rawPayload? ${!!rawPayload}`);

    // Se vierem dados de atribuição do WhatsApp (via N8N/Evolution)
    // Atualizamos ou CRIAMOS a tabela WhatsappMessage com os dados enriquecidos
    if (wamid) {
      // Cria um DTO mesclado com prioridade: DTO > rawPayload > campos profundos do rawPayload
      const mergedDto: CreateLeadDto = {
        ...dto,
        wamid,
        // Garante que o rawJson esteja disponível para o enrich
        rawJson: rawPayload?.rawJson ?? rawPayload, // Se o rawPayload tiver um rawJson dentro (estrutura N8N), usa ele. Senão usa o próprio.
        
        // Mapeamento de campos achatados
        remoteJid: dto.remoteJid ?? rawPayload?.remoteJid ?? rawPayload?.key?.remoteJid,
        pushName: dto.pushName ?? rawPayload?.pushName ?? rawPayload?.name, // N8N manda 'name' às vezes
        messageTimestamp: dto.messageTimestamp ?? rawPayload?.messageTimestamp,
        senderTimestamp: dto.senderTimestamp ?? rawPayload?.senderTimestamp,
        recipientTimestamp: dto.recipientTimestamp ?? rawPayload?.recipientTimestamp,
        status: dto.status ?? rawPayload?.status,
        fromMe: dto.fromMe ?? rawPayload?.fromMe,
        messageType: dto.messageType ?? rawPayload?.messageType,
        conversation: dto.conversation ?? dto.messageText ?? rawPayload?.conversation ?? rawPayload?.messageText ?? rawPayload?.message?.conversation,
        intent: dto.intent ?? rawPayload?.intent,
        
        // Metadata extra
        sender: dto.sender ?? rawPayload?.sender,
        remoteJidAlt: dto.remoteJidAlt ?? rawPayload?.remoteJidAlt ?? rawPayload?.key?.remoteJidAlt,
        addressingMode: dto.addressingMode ?? rawPayload?.addressingMode ?? rawPayload?.key?.addressingMode,
        participant: dto.participant ?? rawPayload?.participant ?? rawPayload?.key?.participant,
        
        // Atribuição
        conversionSource: dto.conversionSource ?? rawPayload?.conversionSource ?? rawPayload?.contextInfo?.conversionSource,
        adSourceId: dto.adSourceId ?? rawPayload?.adSourceId ?? rawPayload?.contextInfo?.externalAdReply?.sourceId,
        ctwaClid: dto.ctwaClid ?? rawPayload?.ctwaClid ?? rawPayload?.contextInfo?.externalAdReply?.ctwaClid,
        adTitle: dto.adTitle ?? rawPayload?.adTitle ?? rawPayload?.contextInfo?.externalAdReply?.title,
        adBody: dto.adBody ?? rawPayload?.adBody ?? rawPayload?.contextInfo?.externalAdReply?.body,
        adThumbnailUrl: dto.adThumbnailUrl ?? rawPayload?.adThumbnailUrl ?? rawPayload?.contextInfo?.externalAdReply?.thumbnailUrl,
        adOriginalImageUrl: dto.adOriginalImageUrl ?? rawPayload?.adOriginalImageUrl ?? rawPayload?.contextInfo?.externalAdReply?.originalImageUrl,
        adSourceType: dto.adSourceType ?? rawPayload?.adSourceType ?? rawPayload?.contextInfo?.externalAdReply?.sourceType,
        adSourceUrl: dto.adSourceUrl ?? rawPayload?.adSourceUrl ?? rawPayload?.contextInfo?.externalAdReply?.sourceUrl,
        
        // Flags de anúncio
        containsAutoReply: dto.containsAutoReply ?? rawPayload?.containsAutoReply ?? rawPayload?.contextInfo?.externalAdReply?.containsAutoReply,
        renderLargerThumbnail: dto.renderLargerThumbnail ?? rawPayload?.renderLargerThumbnail ?? rawPayload?.contextInfo?.externalAdReply?.renderLargerThumbnail,
        showAdAttribution: dto.showAdAttribution ?? rawPayload?.showAdAttribution ?? rawPayload?.contextInfo?.externalAdReply?.showAdAttribution,
        wtwaAdFormat: dto.wtwaAdFormat ?? rawPayload?.wtwaAdFormat ?? rawPayload?.contextInfo?.externalAdReply?.wtwaAdFormat,
        automatedGreetingMessageShown: dto.automatedGreetingMessageShown ?? rawPayload?.automatedGreetingMessageShown ?? rawPayload?.contextInfo?.externalAdReply?.automatedGreetingMessageShown,
        greetingMessageBody: dto.greetingMessageBody ?? rawPayload?.greetingMessageBody ?? rawPayload?.contextInfo?.externalAdReply?.greetingMessageBody,
        
        entryPointConversionSource: dto.entryPointConversionSource ?? rawPayload?.entryPointConversionSource,
        entryPointConversionApp: dto.entryPointConversionApp ?? rawPayload?.entryPointConversionApp,
      };

      this.logger.log(`Enriquecendo WhatsappMessage para lead ${createdLead.id} com wamid ${wamid}`);
      this.enrichWhatsappMessage(userId, mergedDto, createdLead).then(() => {
        this.logger.log(`WhatsappMessage enriquecida com sucesso: ${wamid}`);
      }).catch((err) => {
        this.logger.error(`Erro ao enriquecer WhatsappMessage para o lead ${createdLead.id}`, err);
      });
    } else {
      this.logger.warn(`Wamid não encontrado no payload para o lead ${createdLead.id}. Ignorando enriquecimento.`);
    }

    return createdLead;
  }

  private async enrichWhatsappMessage(userId: string, dto: CreateLeadDto, lead: Lead) {
    const hashedEmail = dto.email ? createHash('sha256').update(dto.email.trim().toLowerCase()).digest('hex') : null;
    const hashedPhone = dto.contact ? createHash('sha256').update(dto.contact.replace(/\D/g, '')).digest('hex') : null;
    
    // Tenta extrair nomes
    let hashedFirstName: string | null = null;
    let hashedLastName: string | null = null;
    if (dto.name) {
      const parts = dto.name.trim().split(/\s+/);
      if (parts.length > 0) hashedFirstName = createHash('sha256').update(parts[0].toLowerCase()).digest('hex');
      if (parts.length > 1) hashedLastName = createHash('sha256').update(parts[parts.length - 1].toLowerCase()).digest('hex');
    }

    // Upsert logic: Create if not exists (based on wamid), Update if exists
    // Isso garante que se o webhook da Evolution falhou ou não chegou, o N8N cria o registro
    // E se o webhook já criou, o N8N apenas enriquece com os dados do Lead (externalId, etc)
    
    // Preparar payload de criação/update
    const messageData = {
        userId,
        remoteJid: dto.remoteJid || (dto.contact ? `${dto.contact}@s.whatsapp.net` : 'unknown'),
        pushName: dto.pushName || dto.name,
        fromMe: dto.fromMe ?? false,
        timestamp: dto.messageTimestamp ? new Date(dto.messageTimestamp * 1000) : new Date(),
        messageType: dto.messageType,
        conversation: dto.conversation,
        
        // Atribuição
        isAd: !!(dto.adSourceId || dto.ctwaClid || dto.conversionSource === 'FB_Ads'),
        adTitle: dto.adTitle,
        adBody: dto.adBody,
        adMediaType: dto.adMediaType,
        adThumbnailUrl: dto.adThumbnailUrl,
        adOriginalImageUrl: dto.adOriginalImageUrl,
        adSourceType: dto.adSourceType,
        adSourceId: dto.adSourceId,
        adSourceUrl: dto.adSourceUrl,
        ctwaClid: dto.ctwaClid,
        sourceApp: dto.sourceApp,
        
        conversionSource: dto.conversionSource,
        entryPointConversionSource: dto.entryPointConversionSource,
        entryPointConversionApp: dto.entryPointConversionApp,

        // Enriquecimento (Meta CAPI)
        hashedEmail,
        hashedPhone,
        hashedFirstName,
        hashedLastName,
        externalId: lead.id,
        eventName: 'Lead',
        leadStage: dto.stage ?? 'Novo',
        intent: dto.intent,
        messagingChannel: 'WhatsApp',
        originPlatform: 'WhatsApp',
        
        // Salva o rawJson se vier (N8N pode mandar o objeto completo)
        rawJson: dto.rawJson ?? undefined
    };

    // Cast para any necessário pois o editor pode não ter atualizado os tipos do Prisma gerados recentemente
    await (this.prisma as any).whatsappMessage.upsert({
      where: { wamid: dto.wamid },
      create: {
        wamid: dto.wamid!, // Validado pelo if(dto.wamid)
        ...messageData
      },
      update: {
        ...messageData
        // Nota: O upsert do Prisma sobrescreve campos. Se quisermos update parcial, teríamos que fazer findUnique antes.
        // Mas como o usuário disse "um evento = um payload (imutável)", e aqui estamos "completando" o evento com dados do Lead,
        // o ideal é garantir que tenhamos todos os dados. O payload do N8N contém tudo.
      }
    });
  }

  async update(userId: string, id: string, dto: UpdateLeadDto, options?: UpdateLeadOptions): Promise<Lead> {
    const lead = await this.findById(userId, id);
    const stage = dto.stage ?? lead.stage;

    const score = calculateLeadScore({
      source: dto.source ?? lead.source ?? undefined,
      stage
    });

    const data: Prisma.LeadUpdateInput = {
      name: dto.name ?? undefined,
      email: dto.email ?? undefined,
      contact: dto.contact ?? undefined,
      source: dto.source ?? undefined,
      notes: dto.notes ?? undefined,
      stage,
      score
    };

    const updatedLead = await this.leadsRepository.update(id, data);

    if (dto.stage && dto.stage !== lead.stage) {
      await this.leadStatusWebhookService.notifyLeadStageChange({
        userId,
        lead: updatedLead,
        newStage: dto.stage,
        appointment: options?.relatedAppointment ?? null
      });
    }

    return updatedLead;
  }

  async delete(userId: string, id: string): Promise<Lead> {
    await this.findById(userId, id);
    
    // Cast para any para evitar erro de tipo temporário do Prisma
    await (this.prisma as any).whatsappMessage.deleteMany({
      where: {
        externalId: id,
        userId: userId // Garante que só deleta mensagens do próprio usuário
      }
    });

    return this.leadsRepository.delete(id);
  }

  async exportCsv(
    userId: string,
    query: LeadsQuery
  ): Promise<{ filename: string; content: string }> {
    const rows = await this.leadsRepository.exportMany(userId, query);

    const headers = [
      'id',
      'createdAt',
      'name',
      'email',
      'contact',
      'source',
      'stage',
      'score',
      'notes'
    ];

    const escape = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const lines = [headers.join(',')];
    for (const lead of rows) {
      lines.push(
        [
          escape(lead.id),
          escape(lead.createdAt.toISOString()),
          escape(lead.name ?? ''),
          escape(lead.email ?? ''),
          escape(lead.contact ?? ''),
          escape(lead.source ?? ''),
          escape(lead.stage),
          escape(lead.score),
          escape(lead.notes ?? '')
        ].join(',')
      );
    }

    const content = '\ufeff' + lines.join('\n');
    const tag = query.source ? `_${query.source}` : '';
    const filename = `leads${tag}_${new Date().toISOString().slice(0, 10)}.csv`;
    return { filename, content };
  }

  async getMetaCapiEvents(userId: string) {
    // Cast para any para evitar erro de tipo temporário do Prisma
    const events = await (this.prisma as any).whatsappMessage.findMany({
      where: {
        userId,
        eventName: { not: null }, // Apenas eventos qualificados
        ctwaClid: { not: null }   // Apenas eventos com atribuição
      },
      select: {
        eventName: true,
        timestamp: true,
        ctwaClid: true,
        adSourceId: true,
        hashedEmail: true,
        hashedPhone: true,
        hashedFirstName: true,
        hashedLastName: true,
        externalId: true,
        conversionSource: true,
        contentName: true,
        contentCategory: true,
        leadStage: true,
        messagingChannel: true,
        originPlatform: true
      },
      orderBy: {
        timestamp: 'desc'
      }
    });

    return events.map((event: any) => ({
      event_name: event.eventName,
      event_time: Math.floor(new Date(event.timestamp).getTime() / 1000),
      action_source: "chat",
      user_data: {
        em: event.hashedEmail ? [event.hashedEmail] : [],
        ph: event.hashedPhone ? [event.hashedPhone] : [],
        fn: event.hashedFirstName ? [event.hashedFirstName] : [],
        ln: event.hashedLastName ? [event.hashedLastName] : [],
        external_id: event.externalId ? [event.externalId] : []
      },
      custom_data: {
        currency: "BRL",
        value: 0, // Ajustar conforme a lógica de valor
        content_name: event.contentName || "Lead WhatsApp",
        content_category: event.contentCategory || "CRM",
        lead_stage: event.leadStage,
        messaging_channel: event.messagingChannel,
        origin_platform: event.originPlatform,
        ad_id: event.adSourceId,
        fb_login_id: event.ctwaClid
      }
    }));
  }
}
