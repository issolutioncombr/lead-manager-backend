import { Injectable, Logger } from '@nestjs/common';
import { Appointment, AppointmentStatus, Lead, LeadStage } from '@prisma/client';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import { PrismaService } from '../prisma/prisma.service';

dayjs.extend(utc);
dayjs.extend(timezone);

interface LeadStageWebhookParams {
  userId: string;
  lead: Lead;
  newStage: LeadStage;
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

    const payload = {
      lead_nome: params.lead.name ?? null,
      lead_email: params.lead.email ?? null,
      lead_contato: params.lead.contact ?? null,
      lead_status: this.formatLeadStageLabel(params.newStage),
      call_link: appointment?.meetLink ?? null,
      call_inicio: appointment ? this.formatDate(appointment.start) : null,
      call_fim: appointment ? this.formatDate(appointment.end) : null,
      call_status: appointment ? this.formatCallStatus(appointment.status) : null
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

  private formatLeadStageLabel(stage: LeadStage): string {
    const labels: Record<LeadStage, string> = {
      NOVO: 'Novo',
      AGENDOU_CALL: 'Agendou uma call',
      ENTROU_CALL: 'Entrou na call',
      COMPROU: 'Comprou',
      NO_SHOW: 'Nao compareceu'
    };
    return labels[stage] ?? stage;
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
}
