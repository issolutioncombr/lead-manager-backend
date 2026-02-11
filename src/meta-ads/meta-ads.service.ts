import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { leadStageLabelFallback, LeadStatusesService } from '../lead-statuses/lead-statuses.service';
import { CreateMetaAdsEventDto, UpdateMetaAdsConfigDto, UpdateMetaAdsEventDto, UpsertMetaAdsMappingDto } from './dto/update-meta-ads-config.dto';

type DispatchLeadStagePayload = {
  userId: string;
  lead: { id: string; name: string | null; email: string | null; contact: string | null; stage: string; createdAt: Date; updatedAt: Date };
  appointment?: { id: string; start: Date; end: Date; status: string; meetLink: string | null } | null;
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const normalizeEmail = (email?: string | null) => (email ?? '').toLowerCase().trim();

const onlyDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');

const normalizePhoneE164 = (phone?: string | null) => {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
};

const normalizeNameParts = (fullName?: string | null) => {
  const raw = (fullName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  if (!raw) return { fn: '', ln: '' };
  const parts = raw.split(/\s+/).filter(Boolean);
  return { fn: parts[0] ?? '', ln: parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? '' };
};

@Injectable()
export class MetaAdsService {
  private readonly logger = new Logger(MetaAdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadStatuses: LeadStatusesService
  ) {}

  private async ensureIntegration(userId: string) {
    return this.prisma.metaAdsIntegration.upsert({
      where: { userId },
      update: {},
      create: { userId }
    });
  }

  async getConfig(userId: string) {
    const integration = await this.ensureIntegration(userId);
    const [events, mappings, statuses] = await Promise.all([
      this.prisma.metaAdsEvent.findMany({ where: { integrationId: integration.id }, orderBy: [{ createdAt: 'asc' }] }),
      this.prisma.metaAdsStatusMapping.findMany({
        where: { integrationId: integration.id },
        include: { event: true },
        orderBy: [{ createdAt: 'asc' }]
      }),
      this.leadStatuses.list(userId)
    ]);
    return { integration, events, mappings, statuses };
  }

  async updateConfig(userId: string, dto: UpdateMetaAdsConfigDto) {
    const integration = await this.ensureIntegration(userId);
    return this.prisma.metaAdsIntegration.update({
      where: { id: integration.id },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.n8nWebhookUrl !== undefined ? { n8nWebhookUrl: dto.n8nWebhookUrl ? String(dto.n8nWebhookUrl).trim() : null } : {}),
        ...(dto.accessToken !== undefined ? { accessToken: dto.accessToken ? String(dto.accessToken).trim() : null } : {}),
        ...(dto.pixelId !== undefined ? { pixelId: dto.pixelId ? String(dto.pixelId).trim() : null } : {}),
        ...(dto.testEventCode !== undefined ? { testEventCode: dto.testEventCode ? String(dto.testEventCode).trim() : null } : {})
      }
    });
  }

  async createEvent(userId: string, dto: CreateMetaAdsEventDto) {
    const integration = await this.ensureIntegration(userId);
    return this.prisma.metaAdsEvent.create({
      data: {
        integrationId: integration.id,
        name: dto.name.trim(),
        metaEventName: dto.metaEventName.trim()
      }
    });
  }

  async updateEvent(userId: string, id: string, dto: UpdateMetaAdsEventDto) {
    const integration = await this.ensureIntegration(userId);
    const existing = await this.prisma.metaAdsEvent.findFirst({ where: { id, integrationId: integration.id } });
    if (!existing) throw new NotFoundException('Evento nao encontrado');
    return this.prisma.metaAdsEvent.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.metaEventName !== undefined ? { metaEventName: dto.metaEventName.trim() } : {})
      }
    });
  }

  async removeEvent(userId: string, id: string) {
    const integration = await this.ensureIntegration(userId);
    const existing = await this.prisma.metaAdsEvent.findFirst({ where: { id, integrationId: integration.id } });
    if (!existing) throw new NotFoundException('Evento nao encontrado');
    await this.prisma.metaAdsEvent.delete({ where: { id } });
  }

  async upsertMappings(userId: string, items: UpsertMetaAdsMappingDto[]) {
    const integration = await this.ensureIntegration(userId);
    await this.leadStatuses.ensureDefaults(userId);

    for (const item of items) {
      const slug = String(item.statusSlug).trim().toUpperCase();
      const status = await this.prisma.leadStatus.findUnique({ where: { userId_slug: { userId, slug } } });
      if (!status) throw new BadRequestException(`Status invalido: ${slug}`);

      const event = await this.prisma.metaAdsEvent.findFirst({ where: { id: item.eventId, integrationId: integration.id } });
      if (!event) throw new BadRequestException('Evento invalido');

      await this.prisma.metaAdsStatusMapping.upsert({
        where: { integrationId_statusSlug: { integrationId: integration.id, statusSlug: slug } },
        update: { eventId: item.eventId, enabled: item.enabled ?? true },
        create: {
          integrationId: integration.id,
          statusSlug: slug,
          eventId: item.eventId,
          enabled: item.enabled ?? true
        }
      });
    }

    return this.getConfig(userId);
  }

  async resolveStageEvent(userId: string, stageSlug: string) {
    const integration = await this.prisma.metaAdsIntegration.findUnique({ where: { userId } });
    if (!integration || !integration.enabled) return null;
    if (!integration.n8nWebhookUrl || !integration.accessToken || !integration.pixelId) return null;

    const slug = String(stageSlug).trim().toUpperCase();
    const mapping = await this.prisma.metaAdsStatusMapping.findUnique({
      where: { integrationId_statusSlug: { integrationId: integration.id, statusSlug: slug } },
      include: { event: true }
    });
    if (!mapping || !mapping.enabled) return null;
    return { integration, event: mapping.event };
  }

  private async resolveStageLabel(userId: string, slug: string) {
    const status = await this.prisma.leadStatus.findUnique({ where: { userId_slug: { userId, slug } } });
    return status?.name ?? leadStageLabelFallback(slug);
  }

  async dispatchLeadStageChange(params: DispatchLeadStagePayload) {
    const resolved = await this.resolveStageEvent(params.userId, params.lead.stage);
    if (!resolved) return;

    const { integration, event } = resolved;

    const fetchFn = (globalThis as { fetch?: (input: string, init?: any) => Promise<any> }).fetch;
    if (!fetchFn) return;

    const emailNorm = normalizeEmail(params.lead.email);
    const phoneE164 = normalizePhoneE164(params.lead.contact);
    const nameParts = normalizeNameParts(params.lead.name);

    const userData: Record<string, any> = {};
    if (emailNorm) userData.em = [sha256(emailNorm)];
    if (phoneE164) userData.ph = [sha256(phoneE164)];
    if (nameParts.fn) userData.fn = [sha256(nameParts.fn)];
    if (nameParts.ln) userData.ln = [sha256(nameParts.ln)];
    userData.external_id = params.userId || params.lead.id;

    const eventTime = Math.floor((params.lead.updatedAt ?? params.lead.createdAt).getTime() / 1000);
    const eventId = `${event.metaEventName}_${params.userId}_${params.lead.id}_${eventTime}`;

    const stageSlug = String(params.lead.stage).trim().toUpperCase();
    const stageLabel = await this.resolveStageLabel(params.userId, stageSlug);

    const metaPayload: Record<string, any> = {
      data: [
        {
          event_name: event.metaEventName,
          event_time: eventTime,
          action_source: 'chat',
          event_id: eventId,
          user_data: userData,
          custom_data: {
            lead_id: params.lead.id,
            lead_stage: stageSlug,
            lead_status: stageLabel,
            appointment_id: params.appointment?.id ?? null
          }
        }
      ]
    };

    if (integration.testEventCode) {
      metaPayload.test_event_code = integration.testEventCode;
    }

    const body = {
      user_id: params.userId,
      lead_id: params.lead.id,
      lead_nome: params.lead.name ?? null,
      lead_email: params.lead.email ?? null,
      lead_contato: params.lead.contact ?? null,
      lead_stage: stageSlug,
      lead_status: stageLabel,
      meta_access_token: integration.accessToken,
      meta_pixel_id: integration.pixelId,
      meta_payload: metaPayload
    };

    try {
      const response = await fetchFn(integration.n8nWebhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const respBody = await response.text().catch(() => null);
        this.logger.warn(`MetaAds webhook respondeu ${response.status}${respBody ? `: ${respBody}` : ''}`);
      }
    } catch (error) {
      this.logger.error('Erro ao enviar evento MetaAds para N8N.', error instanceof Error ? error.stack : String(error));
    }
  }
}
