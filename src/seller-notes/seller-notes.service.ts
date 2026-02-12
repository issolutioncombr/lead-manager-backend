import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ListSellerCallNotesDto } from './dto/list-seller-call-notes.dto';
import { CreateSellerCallNoteDto } from './dto/create-seller-call-note.dto';
import { UpdateSellerCallNoteDto } from './dto/update-seller-call-note.dto';

type AuthenticatedActor = {
  userId: string;
  sellerId?: string;
};

@Injectable()
export class SellerNotesService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureCompanyUser(actor: AuthenticatedActor) {
    if (actor.sellerId) {
      throw new BadRequestException('Somente empresas podem acessar esta funcionalidade');
    }
  }

  private async ensureSellerBelongsToTenant(userId: string, sellerId: string) {
    const seller = await this.prisma.seller.findFirst({ where: { id: sellerId, userId }, select: { id: true } });
    if (!seller) throw new NotFoundException('Vendedor não encontrado');
  }

  private async ensureAppointmentForTenant(userId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, userId },
      select: { id: true, leadId: true }
    });
    if (!appointment) throw new NotFoundException('Video chamada não encontrada');
    return appointment;
  }

  private async ensureLeadForTenant(userId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, userId }, select: { id: true } });
    if (!lead) throw new NotFoundException('Lead não encontrado');
  }

  private async ensureSellerHasActiveAccessToAppointment(userId: string, sellerId: string, appointmentId: string) {
    const now = new Date();
    const access = await (this.prisma as any).sellerVideoCallAccess.findFirst({
      where: {
        sellerId,
        appointmentId,
        status: 'ACTIVE',
        seller: { userId },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
      },
      select: { id: true }
    });
    if (!access) throw new ForbiddenException('Vendedor sem acesso ativo para esta video chamada');
  }

  private async ensureSellerHasActiveAccessToLead(userId: string, sellerId: string, leadId: string) {
    const now = new Date();
    const access = await (this.prisma as any).sellerVideoCallAccess.findFirst({
      where: {
        sellerId,
        leadId,
        status: 'ACTIVE',
        seller: { userId },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
      },
      select: { id: true }
    });
    if (!access) throw new ForbiddenException('Vendedor sem acesso ativo para este lead');
  }

  async list(actor: AuthenticatedActor, query: ListSellerCallNotesDto) {
    const { page = 1, limit = 20, search, sellerId, appointmentId, start, end } = query;

    if (actor.sellerId) {
      const currentSellerId = actor.sellerId;
      await this.ensureSellerBelongsToTenant(actor.userId, currentSellerId);

      const now = new Date();
      const accesses = await (this.prisma as any).sellerVideoCallAccess.findMany({
        where: {
          sellerId: currentSellerId,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
        },
        select: { appointmentId: true, leadId: true }
      });
      const allowedAppointmentIds: string[] = accesses
        .map((a: { appointmentId: string | null }) => a.appointmentId)
        .filter((id: string | null): id is string => !!id);
      const allowedLeadIds: string[] = Array.from(
        new Set(accesses.map((a: { leadId: string }) => a.leadId).filter((id: string | null): id is string => !!id))
      );

      const where: any = {
        userId: actor.userId,
        sellerId: currentSellerId,
        OR: [
          allowedAppointmentIds.length ? { appointmentId: { in: allowedAppointmentIds } } : undefined,
          allowedLeadIds.length ? { leadId: { in: allowedLeadIds } } : undefined,
          { appointmentId: null, leadId: null }
        ].filter(Boolean),
        ...(appointmentId ? { appointmentId } : {}),
        ...(search ? { content: { contains: search, mode: 'insensitive' } } : {})
      };

      if (start || end) {
        where.appointment = {
          start: start ? { gte: new Date(start) } : undefined,
          end: end ? { lte: new Date(end) } : undefined
        };
      }

      const [data, total] = await Promise.all([
        (this.prisma as any).sellerCallNote.findMany({
          where,
          include: {
            lead: { select: { id: true, name: true, email: true, contact: true, stage: true } },
            appointment: {
              select: {
                id: true,
                start: true,
                end: true,
                status: true,
                meetLink: true,
                lead: { select: { id: true, name: true, email: true, contact: true, stage: true } }
              }
            }
          },
          orderBy: { updatedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        (this.prisma as any).sellerCallNote.count({ where })
      ]);

      return { data, total, page, limit };
    }

    this.ensureCompanyUser(actor);
    const where: any = {
      userId: actor.userId,
      ...(sellerId ? { sellerId } : {}),
      ...(appointmentId ? { appointmentId } : {}),
      ...(search ? { content: { contains: search, mode: 'insensitive' } } : {})
    };

    if (start || end) {
      where.appointment = {
        start: start ? { gte: new Date(start) } : undefined,
        end: end ? { lte: new Date(end) } : undefined
      };
    }

    const [data, total] = await Promise.all([
      (this.prisma as any).sellerCallNote.findMany({
        where,
        include: {
          seller: { select: { id: true, name: true, email: true } },
          lead: { select: { id: true, name: true, email: true, contact: true, stage: true } },
          appointment: {
            select: {
              id: true,
              start: true,
              end: true,
              status: true,
              meetLink: true,
              lead: { select: { id: true, name: true, email: true, contact: true, stage: true } }
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      (this.prisma as any).sellerCallNote.count({ where })
    ]);

    return { data, total, page, limit };
  }

  async create(actor: AuthenticatedActor, dto: CreateSellerCallNoteDto) {
    const appointmentId = dto.appointmentId?.trim() || null;
    const leadId = dto.leadId?.trim() || null;

    let finalAppointmentId: string | null = null;
    let finalLeadId: string | null = null;

    if (appointmentId) {
      const appointment = await this.ensureAppointmentForTenant(actor.userId, appointmentId);
      finalAppointmentId = appointment.id;
      if (leadId) {
        if (leadId !== appointment.leadId) {
          throw new BadRequestException('Lead não corresponde à video chamada selecionada');
        }
        finalLeadId = leadId;
      } else {
        finalLeadId = null;
      }
    } else if (leadId) {
      await this.ensureLeadForTenant(actor.userId, leadId);
      finalLeadId = leadId;
    }

    if (actor.sellerId) {
      const sellerId = actor.sellerId;
      await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
      if (finalAppointmentId) {
        await this.ensureSellerHasActiveAccessToAppointment(actor.userId, sellerId, finalAppointmentId);
      } else if (finalLeadId) {
        await this.ensureSellerHasActiveAccessToLead(actor.userId, sellerId, finalLeadId);
      }
      return (this.prisma as any).sellerCallNote.create({
        data: {
          userId: actor.userId,
          sellerId,
          leadId: finalLeadId,
          appointmentId: finalAppointmentId,
          title: dto.title?.trim() || null,
          content: dto.content
        }
      });
    }

    return (this.prisma as any).sellerCallNote.create({
      data: {
        userId: actor.userId,
        sellerId: null,
        leadId: finalLeadId,
        appointmentId: finalAppointmentId,
        title: dto.title?.trim() || null,
        content: dto.content
      }
    });
  }

  async update(actor: AuthenticatedActor, id: string, dto: UpdateSellerCallNoteDto) {
    const existing = await (this.prisma as any).sellerCallNote.findFirst({
      where: { id, userId: actor.userId },
      select: { id: true, appointmentId: true, sellerId: true, leadId: true }
    });
    if (!existing) throw new NotFoundException('Nota não encontrada');

    const next: { appointmentId?: string | null; leadId?: string | null } = {};

    if (dto.appointmentId !== undefined) {
      const v = dto.appointmentId?.trim();
      next.appointmentId = v ? v : null;
    }
    if (dto.leadId !== undefined) {
      const v = dto.leadId?.trim();
      next.leadId = v ? v : null;
    }

    const finalAppointmentId = next.appointmentId !== undefined ? next.appointmentId : (existing.appointmentId as string | null);
    let finalLeadId = next.leadId !== undefined ? next.leadId : (existing.leadId as string | null);

    if (finalAppointmentId) {
      const appointment = await this.ensureAppointmentForTenant(actor.userId, finalAppointmentId);
      if (dto.leadId !== undefined && finalLeadId && finalLeadId !== appointment.leadId) {
        throw new BadRequestException('Lead não corresponde à video chamada selecionada');
      }
      if (finalLeadId && finalLeadId !== appointment.leadId) {
        finalLeadId = null;
      }
    } else if (next.leadId !== undefined) {
      if (finalLeadId) await this.ensureLeadForTenant(actor.userId, finalLeadId);
    }

    if (actor.sellerId) {
      const sellerId = actor.sellerId;
      await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
      if (existing.sellerId !== sellerId) throw new ForbiddenException('Acesso negado');
      if (finalAppointmentId) {
        await this.ensureSellerHasActiveAccessToAppointment(actor.userId, sellerId, finalAppointmentId);
      } else if (finalLeadId) {
        await this.ensureSellerHasActiveAccessToLead(actor.userId, sellerId, finalLeadId);
      }
    } else {
      if (existing.sellerId) throw new ForbiddenException('Acesso negado');
    }

    return (this.prisma as any).sellerCallNote.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title?.trim() || null } : {}),
        ...(dto.appointmentId !== undefined ? { appointmentId: finalAppointmentId } : {}),
        ...(dto.leadId !== undefined || dto.appointmentId !== undefined ? { leadId: finalLeadId } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {})
      }
    });
  }

  async remove(actor: AuthenticatedActor, id: string) {
    const existing = await (this.prisma as any).sellerCallNote.findFirst({
      where: { id, userId: actor.userId },
      select: { id: true, appointmentId: true, sellerId: true, leadId: true }
    });
    if (!existing) throw new NotFoundException('Nota não encontrada');

    if (actor.sellerId) {
      const sellerId = actor.sellerId;
      await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
      if (existing.sellerId !== sellerId) throw new ForbiddenException('Acesso negado');
      if (existing.appointmentId) {
        await this.ensureSellerHasActiveAccessToAppointment(actor.userId, sellerId, existing.appointmentId);
      } else if (existing.leadId) {
        await this.ensureSellerHasActiveAccessToLead(actor.userId, sellerId, existing.leadId);
      }
    } else {
      if (existing.sellerId) throw new ForbiddenException('Acesso negado');
    }

    await (this.prisma as any).sellerCallNote.delete({ where: { id } });
  }
}
