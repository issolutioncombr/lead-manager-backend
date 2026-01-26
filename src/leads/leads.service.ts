import { Injectable, NotFoundException } from '@nestjs/common';
import { Appointment, Lead, LeadStage, Prisma } from '@prisma/client';

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
  constructor(
    private readonly leadsRepository: LeadsRepository,
    private readonly leadStatusWebhookService: LeadStatusWebhookService
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

    return this.leadsRepository.create(userId, data);
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
