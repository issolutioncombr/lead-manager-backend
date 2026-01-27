import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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

    // Se vierem dados de atribuição do WhatsApp (via N8N/Evolution)
    // Atualizamos ou CRIAMOS a tabela WhatsappMessage com os dados enriquecidos
    if (dto.wamid) {
      this.enrichWhatsappMessage(userId, dto, createdLead).catch((err) => {
        this.logger.error(`Erro ao enriquecer WhatsappMessage para o lead ${createdLead.id}`, err);
      });
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
}
