import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { leadStageLabelFallback, LeadStatusesService } from '../lead-statuses/lead-statuses.service';
import { CreateMetaAdsEventDto, UpdateMetaAdsEventDto, UpsertMetaAdsMappingDto } from './dto/update-meta-ads-config.dto';

type DispatchLeadStagePayload = {
  userId: string;
  lead: { id: string; name: string | null; email: string | null; contact: string | null; source: string | null; stage: string; createdAt: Date; updatedAt: Date };
  appointment?: { id: string; start: Date; end: Date; status: string; meetLink: string | null } | null;
  purchase?: { value?: number; contentName?: string | null } | null;
  metaAdsIntegrationId?: string | null;
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

const normalizeOriginPlatform = (source?: string | null) => {
  const normalized = (source ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('whatsapp')) return 'WhatsApp';
  if (normalized.includes('instagram')) return 'Instagram';
  if (normalized.includes('facebook')) return 'Facebook';
  if (normalized.includes('site')) return 'Site';
  return source ?? null;
};

@Injectable()
export class MetaAdsService {
  private readonly logger = new Logger(MetaAdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadStatuses: LeadStatusesService
  ) {}

  private async ensureDefaultIntegration(userId: string): Promise<any> {
    const existing = await (this.prisma as any).metaAdsIntegration.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    });
    if (existing) return existing;
    return (this.prisma as any).metaAdsIntegration.create({ data: { userId, name: 'Padrao' } });
  }

  private async resolveIntegration(userId: string, integrationId?: string): Promise<any> {
    if (integrationId) {
      const integration = await (this.prisma as any).metaAdsIntegration.findFirst({ where: { id: integrationId, userId } });
      if (!integration) throw new NotFoundException('Integracao Meta ADS nao encontrada');
      return integration;
    }
    return this.ensureDefaultIntegration(userId);
  }

  async listIntegrations(userId: string) {
    await this.ensureDefaultIntegration(userId);
    return (this.prisma as any).metaAdsIntegration.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }] });
  }

  async createIntegration(userId: string, dto: { name: string; enabled?: boolean; n8nWebhookUrl?: string | null; accessToken?: string | null; pixelId?: string | null; testEventCode?: string | null; defaultContentName?: string | null; defaultContentCategory?: string | null }) {
    return (this.prisma as any).metaAdsIntegration.create({
      data: {
        userId,
        name: dto.name.trim(),
        enabled: dto.enabled ?? false,
        n8nWebhookUrl: dto.n8nWebhookUrl ? String(dto.n8nWebhookUrl).trim() : null,
        accessToken: dto.accessToken ? String(dto.accessToken).trim() : null,
        pixelId: dto.pixelId ? String(dto.pixelId).trim() : null,
        testEventCode: dto.testEventCode ? String(dto.testEventCode).trim() : null,
        defaultContentName: dto.defaultContentName ? String(dto.defaultContentName).trim() : null,
        defaultContentCategory: dto.defaultContentCategory ? String(dto.defaultContentCategory).trim() : null
      }
    });
  }

  async updateIntegration(userId: string, id: string, dto: { name?: string; enabled?: boolean; n8nWebhookUrl?: string | null; accessToken?: string | null; pixelId?: string | null; testEventCode?: string | null; defaultContentName?: string | null; defaultContentCategory?: string | null }) {
    const integration = await this.resolveIntegration(userId, id);
    return (this.prisma as any).metaAdsIntegration.update({
      where: { id: integration.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name ? String(dto.name).trim() : integration.name } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.n8nWebhookUrl !== undefined ? { n8nWebhookUrl: dto.n8nWebhookUrl ? String(dto.n8nWebhookUrl).trim() : null } : {}),
        ...(dto.accessToken !== undefined ? { accessToken: dto.accessToken ? String(dto.accessToken).trim() : null } : {}),
        ...(dto.pixelId !== undefined ? { pixelId: dto.pixelId ? String(dto.pixelId).trim() : null } : {}),
        ...(dto.testEventCode !== undefined ? { testEventCode: dto.testEventCode ? String(dto.testEventCode).trim() : null } : {}),
        ...(dto.defaultContentName !== undefined ? { defaultContentName: dto.defaultContentName ? String(dto.defaultContentName).trim() : null } : {}),
        ...(dto.defaultContentCategory !== undefined ? { defaultContentCategory: dto.defaultContentCategory ? String(dto.defaultContentCategory).trim() : null } : {})
      }
    });
  }

  async removeIntegration(userId: string, id: string) {
    const integration = await this.resolveIntegration(userId, id);
    await (this.prisma as any).metaAdsIntegration.delete({ where: { id: integration.id } });
    await this.ensureDefaultIntegration(userId);
  }

  async getConfig(userId: string, integrationId?: string) {
    const integration = await this.resolveIntegration(userId, integrationId);
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

  async updateConfig(userId: string, integrationId: string | undefined, dto: any) {
    const integration = await this.resolveIntegration(userId, integrationId);
    return (this.prisma as any).metaAdsIntegration.update({
      where: { id: integration.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name ? String(dto.name).trim() : integration.name } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.n8nWebhookUrl !== undefined ? { n8nWebhookUrl: dto.n8nWebhookUrl ? String(dto.n8nWebhookUrl).trim() : null } : {}),
        ...(dto.accessToken !== undefined ? { accessToken: dto.accessToken ? String(dto.accessToken).trim() : null } : {}),
        ...(dto.pixelId !== undefined ? { pixelId: dto.pixelId ? String(dto.pixelId).trim() : null } : {}),
        ...(dto.testEventCode !== undefined ? { testEventCode: dto.testEventCode ? String(dto.testEventCode).trim() : null } : {}),
        ...(dto.defaultContentName !== undefined ? { defaultContentName: dto.defaultContentName ? String(dto.defaultContentName).trim() : null } : {}),
        ...(dto.defaultContentCategory !== undefined ? { defaultContentCategory: dto.defaultContentCategory ? String(dto.defaultContentCategory).trim() : null } : {})
      }
    });
  }

  async createEvent(userId: string, integrationId: string | undefined, dto: CreateMetaAdsEventDto) {
    const integration = await this.resolveIntegration(userId, integrationId);
    return this.prisma.metaAdsEvent.create({
      data: {
        integrationId: integration.id,
        name: dto.name.trim(),
        metaEventName: dto.metaEventName.trim()
      }
    });
  }

  async updateEvent(userId: string, integrationId: string | undefined, id: string, dto: UpdateMetaAdsEventDto) {
    const integration = await this.resolveIntegration(userId, integrationId);
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

  async removeEvent(userId: string, integrationId: string | undefined, id: string) {
    const integration = await this.resolveIntegration(userId, integrationId);
    const existing = await this.prisma.metaAdsEvent.findFirst({ where: { id, integrationId: integration.id } });
    if (!existing) throw new NotFoundException('Evento nao encontrado');
    await this.prisma.metaAdsEvent.delete({ where: { id } });
  }

  async upsertMappings(userId: string, integrationId: string | undefined, items: UpsertMetaAdsMappingDto[]) {
    const integration = await this.resolveIntegration(userId, integrationId);
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

    return this.getConfig(userId, integration.id);
  }

  async resolveStageEvent(userId: string, stageSlug: string, integrationId?: string | null) {
    const slug = String(stageSlug).trim().toUpperCase();

    if (integrationId) {
      const integration = await this.prisma.metaAdsIntegration.findFirst({ where: { id: integrationId, userId } });
      if (!integration || !integration.enabled) return null;
      if (!integration.n8nWebhookUrl || !integration.accessToken || !integration.pixelId) return null;
      const mapping = await this.prisma.metaAdsStatusMapping.findUnique({
        where: { integrationId_statusSlug: { integrationId: integration.id, statusSlug: slug } },
        include: { event: true }
      });
      if (!mapping || !mapping.enabled) return null;
      return { integration, event: mapping.event };
    }

    const mapping = await this.prisma.metaAdsStatusMapping.findFirst({
      where: {
        statusSlug: slug,
        enabled: true,
        integration: {
          userId,
          enabled: true,
          n8nWebhookUrl: { not: null },
          accessToken: { not: null },
          pixelId: { not: null }
        }
      },
      include: { integration: true, event: true },
      orderBy: [{ integration: { createdAt: 'asc' } }, { createdAt: 'asc' }]
    });
    if (!mapping) return null;
    return { integration: mapping.integration, event: mapping.event };
  }

  private async resolveStageLabel(userId: string, slug: string) {
    const status = await this.prisma.leadStatus.findUnique({ where: { userId_slug: { userId, slug } } });
    return status?.name ?? leadStageLabelFallback(slug);
  }

  async dispatchLeadStageChange(params: DispatchLeadStagePayload) {
    const resolved = await this.resolveStageEvent(params.userId, params.lead.stage, params.metaAdsIntegrationId ?? undefined);
    if (!resolved) return;

    const { integration: integrationRaw, event } = resolved;
    const integration = integrationRaw as any;

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
    userData.external_id = params.lead.id;

    const eventTime = Math.floor((params.lead.updatedAt ?? params.lead.createdAt).getTime() / 1000);
    const eventId = `${event.metaEventName}_${params.userId}_${params.lead.id}_${eventTime}`;

    const stageSlug = String(params.lead.stage).trim().toUpperCase();
    const stageLabel = await this.resolveStageLabel(params.userId, stageSlug);

    const messagingChannel = normalizeOriginPlatform(params.lead.source);
    const originPlatform = normalizeOriginPlatform(params.lead.source);

    const lastWhatsappMessage = await (this.prisma as any).whatsappMessage.findFirst({
      where: { userId: params.userId, OR: [{ leadId: params.lead.id }, { externalId: params.lead.id }] },
      orderBy: { timestamp: 'desc' },
      select: { ctwaClid: true, clientIpAddress: true, clientUserAgent: true }
    });

    const ctwaClid = typeof lastWhatsappMessage?.ctwaClid === 'string' ? lastWhatsappMessage.ctwaClid : null;
    if (ctwaClid) {
      userData.fbc = `fb.1.${eventTime}.${ctwaClid}`;
    }

    const clientIpAddress =
      typeof lastWhatsappMessage?.clientIpAddress === 'string' ? lastWhatsappMessage.clientIpAddress : null;
    if (clientIpAddress) {
      userData.client_ip_address = clientIpAddress;
    }

    const clientUserAgent =
      typeof lastWhatsappMessage?.clientUserAgent === 'string' ? lastWhatsappMessage.clientUserAgent : null;
    if (clientUserAgent) {
      userData.client_user_agent = clientUserAgent;
    }

    const isPurchaseEvent = String(event.metaEventName).trim().toLowerCase() === 'purchase';
    const purchaseValue = params.purchase?.value;
    const purchaseContentName = params.purchase?.contentName
      ? String(params.purchase.contentName).trim()
      : integration.defaultContentName
      ? String(integration.defaultContentName).trim()
      : '';
    if (isPurchaseEvent) {
      if (purchaseValue === undefined || Number.isNaN(purchaseValue) || purchaseValue <= 0) {
        throw new BadRequestException('Para o evento Purchase, informe um value valido.');
      }
      if (!purchaseContentName) {
        throw new BadRequestException('Para o evento Purchase, informe o content_name.');
      }
    }

    const metaPayload: Record<string, any> = {
      data: [
        {
          event_name: event.metaEventName,
          event_time: eventTime,
          action_source: 'chat',
          event_id: eventId,
          user_data: userData,
          custom_data: {
            content_name: integration.defaultContentName ?? null,
            content_category: integration.defaultContentCategory ?? null,
            lead_stage: stageLabel,
            messaging_channel: messagingChannel,
            origin_platform: originPlatform,
            has_call: Boolean(params.appointment?.id),
            attended_call: false,
            converted: false,
            user_id: params.userId,
            lead_id: params.lead.id,
            appointment_id: params.appointment?.id ?? null
          }
        }
      ]
    };

    if (isPurchaseEvent) {
      metaPayload.data[0].custom_data = {
        ...metaPayload.data[0].custom_data,
        currency: 'BRL',
        value: purchaseValue,
        content_name: purchaseContentName,
        converted: true
      };
    }

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
