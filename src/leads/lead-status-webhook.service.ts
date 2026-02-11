import { Injectable, Logger } from '@nestjs/common';
import { Appointment, AppointmentStatus, Lead } from '@prisma/client';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import { PrismaService } from '../prisma/prisma.service';
import { leadStageLabelFallback } from '../lead-statuses/lead-statuses.service';

dayjs.extend(utc);
dayjs.extend(timezone);

interface LeadStageWebhookParams {
  userId: string;
  lead: Lead;
  newStage: string;
  appointment?: Appointment | null;
}

@Injectable()
export class LeadStatusWebhookService {
  private readonly logger = new Logger(LeadStatusWebhookService.name);
  private readonly webhookUrl: string | null;
  private readonly timezone: string;

  constructor(private readonly prisma: PrismaService) {
    const configuredUrl = (process.env.LEAD_STATUS_WEBHOOK_URL ?? '').trim();
    this.webhookUrl = configuredUrl || 'https://renovo-ia-n8n.ogy936.easypanel.host/webhook/sos-kommo';
    const configuredTimezone = (process.env.LEAD_STATUS_WEBHOOK_TZ ?? '').trim();
    this.timezone = configuredTimezone || 'America/Sao_Paulo';
  }

  async notifyLeadStageChange(params: LeadStageWebhookParams): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.warn('URL do webhook de status de lead nao configurada; notificacao ignorada.');
      return;
    }

    const fetchFn = (globalThis as {
      fetch?: (input: string, init?: unknown) => Promise<any>;
    }).fetch;

    if (!fetchFn) {
      this.logger.warn('Fetch API indisponivel; nao foi possivel enviar notificacao de status de lead.');
      return;
    }

    const appointment =
      params.appointment ??
      (await this.prisma.appointment.findFirst({
        where: { userId: params.userId, leadId: params.lead.id },
        orderBy: { start: 'desc' }
      }));

    const whatsappMessage = await (this.prisma as any).whatsappMessage.findFirst({
      where: { userId: params.userId, externalId: params.lead.id },
      orderBy: { timestamp: 'desc' },
      select: {
        wamid: true,
        timestamp: true,
        ctwaClid: true,
        adSourceId: true,
        conversionSource: true,
        entryPointConversionSource: true,
        entryPointConversionApp: true,
        messageType: true,
        conversation: true,
        rawJson: true
      }
    });

    const wa = this.extractWhatsappPayload(whatsappMessage);

    let email = params.lead.email;
    let contact = params.lead.contact;

    // Busca dados do usuario para pegar a API Key
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { apiKey: true }
    });

    // Verifica se os campos estao trocados (email no contato e vice-versa)
    // Se o campo 'email' nao tem @ e o campo 'contact' tem, destroca.
    if (email && !email.includes('@') && contact && contact.includes('@')) {
      const temp = email;
      email = contact;
      contact = temp;
    }

    const stageSlug = String(params.newStage).trim().toUpperCase();
    const leadStatusLabel = await this.resolveLeadStageLabel(params.userId, stageSlug);

    const payload = {
      user_id: params.userId,
      user_api_key: user?.apiKey ?? null,
      lead_id: params.lead.id,
      lead_nome: params.lead.name ?? null,
      lead_email: email ?? null,
      lead_contato: contact ?? null,
      lead_source: params.lead.source ?? null,
      lead_notes: params.lead.notes ?? null,
      lead_score: params.lead.score ?? 0,
      lead_stage: stageSlug,
      lead_status: leadStatusLabel,
      call_link: appointment?.meetLink ?? null,
      call_inicio: appointment ? this.formatDate(appointment.start) : null,
      call_fim: appointment ? this.formatDate(appointment.end) : null,
      call_data: appointment ? dayjs(appointment.start).tz(this.timezone).format('DD/MM/YYYY') : null,
      call_hora: appointment ? dayjs(appointment.start).tz(this.timezone).format('HH:mm') : null,
      call_status: appointment ? this.formatCallStatus(appointment.status) : null,

      ctwaClid: wa.ctwaClid,
      adSourceId: wa.adSourceId,
      conversionSource: wa.conversionSource,
      entryPointConversionSource: wa.entryPointConversionSource,
      entryPointConversionApp: wa.entryPointConversionApp,
      messageTimestamp: wa.messageTimestamp,
      messageType: wa.messageType,
      conversation: wa.conversation,
      wamid: wa.wamid
    };

    try {
      const response = await fetchFn(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = await response.text().catch(() => null);
        this.logger.warn(
          `Webhook de status de lead respondeu com ${response.status}${body ? `: ${body}` : ''}`
        );
      }
    } catch (error) {
      this.logger.error(
        'Erro ao enviar webhook de status de lead.',
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  private async resolveLeadStageLabel(userId: string, slug: string) {
    const status = await (this.prisma as any).leadStatus.findUnique({ where: { userId_slug: { userId, slug } } });
    return status?.name ?? leadStageLabelFallback(slug);
  }

  private formatCallStatus(status: AppointmentStatus): string {
    const labels: Record<AppointmentStatus, string> = {
      AGENDADA: 'Agendada',
      REMARCADO: 'Remarcado'
    };
    return labels[status] ?? status;
  }

  private formatDate(date: Date): string {
    try {
      return dayjs(date).tz(this.timezone).format('YYYY-MM-DD[T]HH:mm:ssZ');
    } catch {
      return date.toISOString();
    }
  }

  private extractWhatsappPayload(whatsappMessage: any) {
    const raw = this.getWhatsappRawPayload(whatsappMessage?.rawJson);

    const ts = whatsappMessage?.timestamp ? new Date(whatsappMessage.timestamp) : null;
    const messageTimestamp =
      raw?.messageTimestamp ?? (ts ? Math.floor(ts.getTime() / 1000) : null);

    const ctwaClid =
      whatsappMessage?.ctwaClid ??
      raw?.ctwaClid ??
      raw?.contextInfo?.externalAdReply?.ctwaClid ??
      raw?.message?.contextInfo?.externalAdReply?.ctwaClid ??
      null;

    const adSourceId =
      whatsappMessage?.adSourceId ??
      raw?.adSourceId ??
      raw?.contextInfo?.externalAdReply?.sourceId ??
      raw?.message?.contextInfo?.externalAdReply?.sourceId ??
      null;

    const conversionSource =
      whatsappMessage?.conversionSource ?? raw?.conversionSource ?? raw?.contextInfo?.conversionSource ?? null;

    const entryPointConversionSource =
      whatsappMessage?.entryPointConversionSource ?? raw?.entryPointConversionSource ?? null;

    const entryPointConversionApp =
      whatsappMessage?.entryPointConversionApp ?? raw?.entryPointConversionApp ?? null;

    const messageType = whatsappMessage?.messageType ?? raw?.messageType ?? null;

    const conversation =
      whatsappMessage?.conversation ??
      raw?.conversation ??
      raw?.messageText ??
      raw?.message?.conversation ??
      null;

    return {
      wamid: whatsappMessage?.wamid ?? raw?.wamid ?? raw?.key?.id ?? null,
      messageTimestamp,
      ctwaClid,
      adSourceId,
      conversionSource,
      entryPointConversionSource,
      entryPointConversionApp,
      messageType,
      conversation
    };
  }

  private getWhatsappRawPayload(rawJson: any): any {
    if (!rawJson) return null;
    if (typeof rawJson !== 'object') return null;
    return rawJson.rawJson && typeof rawJson.rawJson === 'object' ? rawJson.rawJson : rawJson;
  }
}
