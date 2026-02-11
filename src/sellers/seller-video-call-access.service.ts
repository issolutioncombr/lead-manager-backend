import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

function parseOptionalDate(value?: string | null): Date | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('expiresAt inválido');
  }
  return d;
}

@Injectable()
export class SellerVideoCallAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureSellerBelongsToTenant(userId: string, sellerId: string) {
    const seller = await this.prisma.seller.findFirst({
      where: { id: sellerId, userId },
      select: { id: true }
    });
    if (!seller) throw new NotFoundException('Vendedor não encontrado');
  }

  private async resolveLeadForTenant(userId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, userId },
      select: { id: true, contact: true, name: true, email: true }
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    return lead;
  }

  private async resolveAppointmentForTenant(userId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, userId },
      select: { id: true, leadId: true, meetLink: true, start: true, end: true }
    });
    if (!appointment) throw new NotFoundException('Video chamada não encontrada');
    return appointment;
  }

  async getActiveLinkForSeller(userId: string, sellerId: string) {
    await this.ensureSellerBelongsToTenant(userId, sellerId);
    const now = new Date();
    const link = await (this.prisma as any).sellerVideoCallAccess.findFirst({
      where: {
        sellerId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
      },
      orderBy: { createdAt: 'desc' }
    });
    return link ?? null;
  }

  async requireActiveLeadScope(userId: string, sellerId: string): Promise<{ leadId: string; appointmentId: string | null }> {
    const link = await this.getActiveLinkForSeller(userId, sellerId);
    if (!link?.leadId) {
      throw new ForbiddenException('Vendedor sem vínculo ativo');
    }
    return { leadId: link.leadId, appointmentId: link.appointmentId ?? null };
  }

  async linkSellerToVideoCall(
    userId: string,
    sellerId: string,
    payload: { appointmentId?: string | null; leadId?: string | null; expiresAt?: string | null }
  ) {
    await this.ensureSellerBelongsToTenant(userId, sellerId);

    const appointmentId = String(payload.appointmentId ?? '').trim() || null;
    const leadIdInput = String(payload.leadId ?? '').trim() || null;
    const expiresAt = parseOptionalDate(payload.expiresAt ?? null);

    if (!appointmentId && !leadIdInput) {
      throw new BadRequestException('Informe appointmentId ou leadId');
    }

    const appointment = appointmentId ? await this.resolveAppointmentForTenant(userId, appointmentId) : null;
    const inferredLeadId = appointment?.leadId ?? null;
    const leadId = leadIdInput ?? inferredLeadId;

    if (!leadId) {
      throw new BadRequestException('Não foi possível determinar o leadId do vínculo');
    }

    if (leadIdInput && inferredLeadId && leadIdInput !== inferredLeadId) {
      throw new BadRequestException('leadId não corresponde à video chamada informada');
    }

    await this.resolveLeadForTenant(userId, leadId);

    const existing = await this.getActiveLinkForSeller(userId, sellerId);
    const effectiveAppointmentId = appointment?.id ?? appointmentId;
    if (
      existing &&
      existing.leadId === leadId &&
      String(existing.appointmentId ?? '') === String(effectiveAppointmentId ?? '') &&
      String(existing.expiresAt ?? '') === String(expiresAt ?? '')
    ) {
      return existing;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await (tx as any).sellerVideoCallAccess.updateMany({
        where: {
          sellerId,
          status: 'ACTIVE',
          ...(effectiveAppointmentId ? { appointmentId: { not: effectiveAppointmentId } } : {})
        },
        data: { status: 'REVOKED' }
      });

      if (effectiveAppointmentId) {
        const existingLink = await (tx as any).sellerVideoCallAccess.findFirst({
          where: { sellerId, appointmentId: effectiveAppointmentId }
        });

        if (existingLink) {
          return (tx as any).sellerVideoCallAccess.update({
            where: { id: existingLink.id },
            data: {
              leadId,
              appointmentId: effectiveAppointmentId,
              status: 'ACTIVE',
              expiresAt
            }
          });
        }
      }

      return (tx as any).sellerVideoCallAccess.create({
        data: {
          sellerId,
          leadId,
          appointmentId: effectiveAppointmentId,
          status: 'ACTIVE',
          expiresAt
        }
      });
    });

    return created;
  }

  async revokeLink(userId: string, sellerId: string, linkId: string) {
    await this.ensureSellerBelongsToTenant(userId, sellerId);
    const existing = await (this.prisma as any).sellerVideoCallAccess.findFirst({
      where: { id: linkId, sellerId }
    });
    if (!existing) throw new NotFoundException('Vínculo não encontrado');
    await this.resolveLeadForTenant(userId, existing.leadId);

    return (this.prisma as any).sellerVideoCallAccess.update({
      where: { id: linkId },
      data: { status: 'REVOKED' }
    });
  }

  async getScopedLeadSummaryForSeller(userId: string, sellerId: string) {
    const scope = await this.requireActiveLeadScope(userId, sellerId);
    const lead = await this.resolveLeadForTenant(userId, scope.leadId);
    return { ...scope, lead };
  }

  ensureCompanyUser(actor: { sellerId?: string | null }) {
    if (actor.sellerId) {
      throw new ForbiddenException('Somente empresas podem acessar esta funcionalidade');
    }
  }
}
