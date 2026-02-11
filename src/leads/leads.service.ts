import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Logger, ConflictException } from '@nestjs/common';
import { Appointment, Lead, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

import { calculateLeadScore } from '../common/utils/lead-scoring.util';
import { LeadStatusesService } from '../lead-statuses/lead-statuses.service';
import { MetaAdsService } from '../meta-ads/meta-ads.service';
import { SellerVideoCallAccessService } from '../sellers/seller-video-call-access.service';
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
    private readonly prisma: PrismaService,
    private readonly access: SellerVideoCallAccessService,
    private readonly leadStatuses: LeadStatusesService,
    private readonly metaAds: MetaAdsService
  ) {}

  list(userId: string, query: LeadsQuery): Promise<PaginatedLeads> {
    return this.leadsRepository.findMany(userId, query);
  }

  async listForSeller(userId: string, sellerId: string, _query: LeadsQuery): Promise<PaginatedLeads> {
    const scope = await this.access.requireActiveLeadScope(userId, sellerId);
    const lead = await this.leadsRepository.findById(userId, scope.leadId);
    if (!lead) throw new NotFoundException('Lead nao encontrado');
    return { data: [lead], total: 1, page: 1, limit: 1 };
  }

  async findByIdForContext(userId: string, id: string, opts?: { sellerId?: string | null }) {
    const sellerId = opts?.sellerId ?? null;
    if (sellerId) {
      const scope = await this.access.requireActiveLeadScope(userId, sellerId);
      if (scope.leadId !== id) {
        throw new ForbiddenException('Acesso negado ao lead');
      }
    }
    return this.findById(userId, id);
  }

  async findById(userId: string, id: string) {
    const lead = await this.leadsRepository.findById(userId, id);

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado');
    }

    return lead;
  }

  async create(userId: string, dto: CreateLeadDto): Promise<Lead> {
    this.logger.log(
      `[CREATE LEAD] Payload recebido (User: ${userId}): ${JSON.stringify(this.redactSecrets(dto), null, 2)}`
    );

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

    const stage = await this.ensureValidLeadStage(userId, dto.stage ?? 'NOVO');

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

    try {
      await this.metaAds.dispatchLeadStageChange({ userId, lead: createdLead });
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        throw error;
      }
    }

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
        deviceSource: dto.deviceSource ?? rawPayload?.deviceSource ?? rawPayload?.rawJson?.deviceSource,
        instance: dto.instance ?? rawPayload?.instance ?? rawPayload?.rawJson?.instance,
        instanceId: dto.instanceId ?? rawPayload?.instanceId ?? rawPayload?.rawJson?.instanceId,
        
        // Atribuição
        conversionSource: dto.conversionSource ?? rawPayload?.conversionSource ?? rawPayload?.contextInfo?.conversionSource,
        adSourceId: dto.adSourceId ?? rawPayload?.adSourceId ?? rawPayload?.contextInfo?.externalAdReply?.sourceId,
        ctwaClid: dto.ctwaClid ?? rawPayload?.ctwaClid ?? rawPayload?.contextInfo?.externalAdReply?.ctwaClid,
        sourceApp:
          dto.sourceApp ??
          rawPayload?.sourceApp ??
          rawPayload?.rawJson?.sourceApp ??
          rawPayload?.contextInfo?.externalAdReply?.sourceApp ??
          rawPayload?.rawJson?.contextInfo?.externalAdReply?.sourceApp ??
          rawPayload?.message?.contextInfo?.externalAdReply?.sourceApp ??
          rawPayload?.rawJson?.message?.contextInfo?.externalAdReply?.sourceApp,
        adTitle: dto.adTitle ?? rawPayload?.adTitle ?? rawPayload?.contextInfo?.externalAdReply?.title,
        adBody: dto.adBody ?? rawPayload?.adBody ?? rawPayload?.contextInfo?.externalAdReply?.body,
        adMediaType: dto.adMediaType ?? rawPayload?.adMediaType ?? rawPayload?.contextInfo?.externalAdReply?.mediaType,
        adThumbnailUrl: dto.adThumbnailUrl ?? rawPayload?.adThumbnailUrl ?? rawPayload?.contextInfo?.externalAdReply?.thumbnailUrl,
        adOriginalImageUrl: dto.adOriginalImageUrl ?? rawPayload?.adOriginalImageUrl ?? rawPayload?.contextInfo?.externalAdReply?.originalImageUrl,
        adSourceType: dto.adSourceType ?? rawPayload?.adSourceType ?? rawPayload?.contextInfo?.externalAdReply?.sourceType,
        adSourceUrl: dto.adSourceUrl ?? rawPayload?.adSourceUrl ?? rawPayload?.contextInfo?.externalAdReply?.sourceUrl,
        adRef: dto.adRef ?? rawPayload?.adRef ?? rawPayload?.rawJson?.adRef,
        
        // Flags de anúncio
        containsAutoReply: dto.containsAutoReply ?? rawPayload?.containsAutoReply ?? rawPayload?.contextInfo?.externalAdReply?.containsAutoReply,
        renderLargerThumbnail: dto.renderLargerThumbnail ?? rawPayload?.renderLargerThumbnail ?? rawPayload?.contextInfo?.externalAdReply?.renderLargerThumbnail,
        showAdAttribution: dto.showAdAttribution ?? rawPayload?.showAdAttribution ?? rawPayload?.contextInfo?.externalAdReply?.showAdAttribution,
        wtwaAdFormat: dto.wtwaAdFormat ?? rawPayload?.wtwaAdFormat ?? rawPayload?.contextInfo?.externalAdReply?.wtwaAdFormat,
        automatedGreetingMessageShown: dto.automatedGreetingMessageShown ?? rawPayload?.automatedGreetingMessageShown ?? rawPayload?.contextInfo?.externalAdReply?.automatedGreetingMessageShown,
        greetingMessageBody: dto.greetingMessageBody ?? rawPayload?.greetingMessageBody ?? rawPayload?.contextInfo?.externalAdReply?.greetingMessageBody,
        
        entryPointConversionSource: dto.entryPointConversionSource ?? rawPayload?.entryPointConversionSource,
        entryPointConversionApp: dto.entryPointConversionApp ?? rawPayload?.entryPointConversionApp,
        entryPointConversionExternalSource:
          dto.entryPointConversionExternalSource ?? rawPayload?.entryPointConversionExternalSource,
        entryPointConversionExternalMedium:
          dto.entryPointConversionExternalMedium ?? rawPayload?.entryPointConversionExternalMedium,
        ctwaSignals: dto.ctwaSignals ?? rawPayload?.ctwaSignals,

        destination: dto.destination ?? rawPayload?.destination ?? rawPayload?.rawJson?.destination,
        serverUrl: dto.serverUrl ?? rawPayload?.serverUrl ?? rawPayload?.rawJson?.serverUrl,
        executionMode: dto.executionMode ?? rawPayload?.executionMode ?? rawPayload?.rawJson?.executionMode,
        receivedAt: dto.receivedAt ?? rawPayload?.receivedAt ?? rawPayload?.rawJson?.receivedAt,
        eventType: dto.eventType ?? rawPayload?.eventType ?? rawPayload?.rawJson?.eventType,
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
        remoteJidAlt: dto.remoteJidAlt,
        phoneRaw: dto.contact ? dto.contact.replace(/\D/g, '') : undefined,
        pushName: dto.pushName || dto.name,
        sender: dto.sender,
        fromMe: dto.fromMe ?? false,
        addressingMode: dto.addressingMode,
        participant: dto.participant,
        timestamp: dto.messageTimestamp ? new Date(dto.messageTimestamp * 1000) : new Date(),
        senderTimestamp: dto.senderTimestamp ? BigInt(dto.senderTimestamp) : undefined,
        recipientTimestamp: dto.recipientTimestamp ? BigInt(dto.recipientTimestamp) : undefined,
        status: dto.status,
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
        ref: (dto as any).ref ?? undefined,
        adRef: dto.adRef,
        sourceApp: dto.sourceApp,
        deviceSource: dto.deviceSource,
        instance: dto.instance,
        instanceId: dto.instanceId,
        containsAutoReply: dto.containsAutoReply,
        renderLargerThumbnail: dto.renderLargerThumbnail,
        showAdAttribution: dto.showAdAttribution,
        wtwaAdFormat: dto.wtwaAdFormat,
        automatedGreetingMessageShown: dto.automatedGreetingMessageShown,
        greetingMessageBody: dto.greetingMessageBody,
        
        conversionSource: dto.conversionSource,
        entryPointConversionSource: dto.entryPointConversionSource,
        entryPointConversionApp: dto.entryPointConversionApp,
        entryPointConversionExternalSource: dto.entryPointConversionExternalSource,
        entryPointConversionExternalMedium: dto.entryPointConversionExternalMedium,
        ctwaSignals: dto.ctwaSignals,

        destination: dto.destination,
        serverUrl: dto.serverUrl,
        executionMode: dto.executionMode,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
        eventType: dto.eventType,

        // Enriquecimento (Meta CAPI)
        hashedEmail,
        hashedPhone,
        hashedFirstName,
        hashedLastName,
        externalId: lead.id,
        leadId: lead.id,
        eventName: 'Lead',
        leadStage: dto.stage ?? 'Novo',
        intent: dto.intent,
        messagingChannel: 'WhatsApp',
        originPlatform: 'WhatsApp',
        
        // Salva o rawJson se vier (N8N pode mandar o objeto completo)
        rawJson: dto.rawJson ? this.redactSecrets(dto.rawJson) : undefined
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
    const stage = dto.stage ? await this.ensureValidLeadStage(userId, dto.stage) : lead.stage;

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
        newStage: stage,
        appointment: options?.relatedAppointment ?? null
      });

      await this.metaAds.dispatchLeadStageChange({
        userId,
        lead: updatedLead,
        appointment: options?.relatedAppointment ?? null,
        metaAdsIntegrationId: dto.metaAdsIntegrationId,
        purchase: {
          value: dto.purchaseValue,
          contentName: dto.purchaseContentName
        }
      });

      await this.applyLeadStageToWhatsappMessage(userId, updatedLead.id, stage);
    }

    return updatedLead;
  }

  private async applyLeadStageToWhatsappMessage(userId: string, leadId: string, newStage: string) {
    const whatsappMessage = await (this.prisma as any).whatsappMessage.findFirst({
      where: { userId, OR: [{ leadId }, { externalId: leadId }] },
      orderBy: { timestamp: 'desc' }
    });

    if (!whatsappMessage) return;

    const raw = this.getWhatsappRawPayload(whatsappMessage.rawJson);

    const updateData: Record<string, any> = {
      eventName: this.getMetaEventName(newStage),
      leadStage: this.formatLeadStageLabel(newStage)
    };

    const mappedFromRaw = this.mapWhatsappColumnsFromRawJson(raw);

    await (this.prisma as any).whatsappMessage.update({
      where: { wamid: whatsappMessage.wamid },
      data: {
        ...mappedFromRaw,
        ...updateData
      }
    });
  }

  private getWhatsappRawPayload(rawJson: any): any {
    if (!rawJson) return null;
    if (typeof rawJson !== 'object') return null;
    return rawJson.rawJson && typeof rawJson.rawJson === 'object' ? rawJson.rawJson : rawJson;
  }

  private mapWhatsappColumnsFromRawJson(raw: any): Record<string, any> {
    if (!raw || typeof raw !== 'object') return {};

    return {
      timestamp: raw.messageTimestamp ? new Date(raw.messageTimestamp * 1000) : undefined,
      remoteJid: raw.remoteJid ?? undefined,
      remoteJidAlt: raw.remoteJidAlt ?? undefined,
      fromMe: raw.fromMe ?? undefined,
      addressingMode: raw.addressingMode ?? undefined,
      participant: raw.participant ?? undefined,
      pushName: raw.pushName ?? raw.name ?? undefined,
      sender: raw.sender ?? undefined,
      status: raw.status ?? undefined,
      messageType: raw.messageType ?? undefined,
      conversation: raw.conversation ?? raw.messageText ?? raw.message?.conversation ?? undefined,
      senderTimestamp: raw.senderTimestamp ? BigInt(raw.senderTimestamp) : undefined,
      recipientTimestamp: raw.recipientTimestamp ? BigInt(raw.recipientTimestamp) : undefined,
      deviceSource: raw.deviceSource ?? undefined,
      instance: raw.instance ?? undefined,
      instanceId: raw.instanceId ?? undefined,
      adSourceType: raw.adSourceType ?? undefined,
      adSourceId: raw.adSourceId ?? undefined,
      adSourceUrl: raw.adSourceUrl ?? undefined,
      sourceApp: raw.sourceApp ?? undefined,
      ctwaClid: raw.ctwaClid ?? undefined,
      adTitle: raw.adTitle ?? undefined,
      adBody: raw.adBody ?? undefined,
      adMediaType: raw.adMediaType ?? undefined,
      adThumbnailUrl: raw.adThumbnailUrl ?? undefined,
      adOriginalImageUrl: raw.adOriginalImageUrl ?? undefined,
      containsAutoReply: raw.containsAutoReply ?? undefined,
      renderLargerThumbnail: raw.renderLargerThumbnail ?? undefined,
      showAdAttribution: raw.showAdAttribution ?? undefined,
      wtwaAdFormat: raw.wtwaAdFormat ?? undefined,
      automatedGreetingMessageShown: raw.automatedGreetingMessageShown ?? undefined,
      greetingMessageBody: raw.greetingMessageBody ?? undefined,
      conversionSource: raw.conversionSource ?? undefined,
      entryPointConversionSource: raw.entryPointConversionSource ?? undefined,
      entryPointConversionApp: raw.entryPointConversionApp ?? undefined,
      entryPointConversionExternalSource: raw.entryPointConversionExternalSource ?? undefined,
      entryPointConversionExternalMedium: raw.entryPointConversionExternalMedium ?? undefined,
      ctwaSignals: raw.ctwaSignals ?? undefined,
      adRef: raw.adRef ?? undefined,
      destination: raw.destination ?? undefined,
      serverUrl: raw.serverUrl ?? undefined,
      executionMode: raw.executionMode ?? undefined,
      receivedAt: raw.receivedAt ? new Date(raw.receivedAt) : undefined,
      eventType: raw.eventType ?? undefined,
      rawJson: this.redactSecrets(raw)
    };
  }

  private async ensureValidLeadStage(userId: string, stage: string) {
    await this.leadStatuses.ensureDefaults(userId);
    const slug = String(stage).trim().toUpperCase();
    const status = await (this.prisma as any).leadStatus.findUnique({ where: { userId_slug: { userId, slug } } });
    if (!status) {
      throw new ConflictException('Status de lead invalido');
    }
    return status.slug;
  }

  private getMetaEventName(stage: string): string {
    switch (stage) {
      case 'NOVO':
        return 'Lead';
      case 'AGENDOU_CALL':
        return 'Schedule';
      case 'ENTROU_CALL':
        return 'QualifiedLead';
      case 'COMPROU':
        return 'Purchase';
      case 'NO_SHOW':
        return 'NoShow';
      default:
        return 'Lead';
    }
  }

  private formatLeadStageLabel(stage: string): string {
    const s = String(stage).trim().toUpperCase();
    return s.replace(/_/g, ' ');
  }

  async delete(userId: string, id: string): Promise<Lead> {
    await this.findById(userId, id);
    
    // Cast para any para evitar erro de tipo temporário do Prisma
    await (this.prisma as any).whatsappMessage.deleteMany({
      where: {
        userId: userId,
        OR: [{ externalId: id }, { leadId: id }]
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

  async getLeadMessagesForContext(
    userId: string,
    leadId: string,
    options?: { page?: number; limit?: number; textOnly?: boolean },
    actor?: { sellerId?: string | null }
  ) {
    if (actor?.sellerId) {
      const scope = await this.access.requireActiveLeadScope(userId, actor.sellerId);
      if (scope.leadId !== leadId) {
        throw new ForbiddenException('Acesso negado ao lead');
      }
    }
    return this.getLeadMessages(userId, leadId, options);
  }

  async getLeadMessages(
    userId: string,
    leadId: string,
    options?: { page?: number; limit?: number; textOnly?: boolean }
  ) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.max(1, Math.min(200, options?.limit ?? 50));
    const skip = (page - 1) * limit;
    const baseWhere: Record<string, any> = {
      userId,
      OR: [{ leadId }, { externalId: leadId }]
    };
    const where =
      options?.textOnly
        ? {
            AND: [
              baseWhere,
              { conversation: { not: null } },
              { conversation: { not: '' } }
            ]
          }
        : baseWhere;
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
          conversation: true,
          messageType: true,
          timestamp: true,
          pushName: true,
          phoneRaw: true
        }
      }),
      (this.prisma as any).whatsappMessage.count({ where })
    ]);
    return { data, total, page, limit };
  }

  async getLastMessagesForLeads(userId: string, leadIds: string[]) {
    if (leadIds.length === 0) return {};
    const msgsByLead = await (this.prisma as any).whatsappMessage.findMany({
      where: {
        userId,
        OR: [{ leadId: { in: leadIds } }, { externalId: { in: leadIds } }]
      },
      orderBy: { timestamp: 'desc' },
      select: {
        leadId: true,
        externalId: true,
        conversation: true,
        fromMe: true,
        messageType: true,
        timestamp: true
      }
    });
    const latest: Record<
      string,
      { text?: string | null; fromMe: boolean; messageType?: string | null; timestamp: string }
    > = {};
    for (const m of msgsByLead) {
      const key = m.leadId ?? m.externalId;
      if (!key) continue;
      if (!latest[key]) {
        latest[key] = {
          text: m.conversation,
          fromMe: !!m.fromMe,
          messageType: m.messageType ?? null,
          timestamp: m.timestamp.toISOString()
        };
      }
    }
    return latest;
  }
  async getMetaCapiEvents(userId: string) {
    // Cast para any para evitar erro de tipo temporário do Prisma
    const events = await (this.prisma as any).whatsappMessage.findMany({
      where: {
        userId,
        eventName: { not: null } // Apenas eventos qualificados
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
        originPlatform: true,
        rawJson: true
      },
      orderBy: {
        timestamp: 'desc'
      }
    });

    const mapped = events
      .map((event: any) => {
        const raw = this.getWhatsappRawPayload(event.rawJson);
        const ctwaClid =
          event.ctwaClid ??
          raw?.ctwaClid ??
          raw?.contextInfo?.externalAdReply?.ctwaClid ??
          raw?.message?.contextInfo?.externalAdReply?.ctwaClid ??
          null;

        if (!ctwaClid) return null;

        const adSourceId =
          event.adSourceId ??
          raw?.adSourceId ??
          raw?.contextInfo?.externalAdReply?.sourceId ??
          raw?.message?.contextInfo?.externalAdReply?.sourceId ??
          null;

        return {
          event_name: event.eventName,
          event_time: Math.floor(new Date(event.timestamp).getTime() / 1000),
          action_source: 'chat',
          user_data: {
            em: event.hashedEmail ? [event.hashedEmail] : [],
            ph: event.hashedPhone ? [event.hashedPhone] : [],
            fn: event.hashedFirstName ? [event.hashedFirstName] : [],
            ln: event.hashedLastName ? [event.hashedLastName] : [],
            external_id: event.externalId ? [event.externalId] : []
          },
          custom_data: {
            currency: 'BRL',
            value: 0,
            content_name: event.contentName || 'Lead WhatsApp',
            content_category: event.contentCategory || 'CRM',
            lead_stage: event.leadStage,
            messaging_channel: event.messagingChannel,
            origin_platform: event.originPlatform,
            ad_id: adSourceId,
            fb_login_id: ctwaClid
          }
        };
      })
      .filter(Boolean);

    return mapped;
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
