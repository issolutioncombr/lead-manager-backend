import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateSellerReminderDto } from './dto/create-seller-reminder.dto';
import { ListSellerRemindersDto } from './dto/list-seller-reminders.dto';
import { UpdateSellerReminderDto } from './dto/update-seller-reminder.dto';
import { ListSellerRemindersOverviewDto } from './dto/list-seller-reminders-overview.dto';

type AuthenticatedActor = {
  userId: string;
  sellerId?: string;
};

@Injectable()
export class SellerRemindersService {
  constructor(private readonly prisma: PrismaService) {}

  private isValidStatus(value: string) {
    return value === 'PENDING' || value === 'DONE' || value === 'CANCELED';
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
    if (!access) throw new BadRequestException('Vendedor sem acesso ativo para esta video chamada');
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
    if (!access) throw new BadRequestException('Vendedor sem acesso ativo para este lead');
  }

  private ensureCompanyUser(actor: AuthenticatedActor) {
    if (actor.sellerId) {
      throw new BadRequestException('Somente empresas podem acessar esta funcionalidade');
    }
  }

  private async ensureSellerBelongsToTenant(userId: string, sellerId: string) {
    const seller = await this.prisma.seller.findFirst({ where: { id: sellerId, userId }, select: { id: true } });
    if (!seller) throw new NotFoundException('Vendedor não encontrado');
  }

  async list(actor: AuthenticatedActor, query: ListSellerRemindersDto) {
    const { page = 1, limit = 20, status, start, end, search } = query;

    if (status && !this.isValidStatus(status)) {
      throw new BadRequestException('Status inválido');
    }

    const where: any = actor.sellerId
      ? {
          userId: actor.userId,
          sellerId: actor.sellerId,
          ...(status ? { status } : {}),
          ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { content: { contains: search, mode: 'insensitive' } }] } : {})
        }
      : {
          userId: actor.userId,
          sellerId: null,
          ...(status ? { status } : {}),
          ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { content: { contains: search, mode: 'insensitive' } }] } : {})
        };

    if (start || end) {
      where.remindAt = {
        gte: start ? new Date(start) : undefined,
        lte: end ? new Date(end) : undefined
      };
    }

    if (actor.sellerId) {
      await this.ensureSellerBelongsToTenant(actor.userId, actor.sellerId);
    }

    const [data, total] = await Promise.all([
      (this.prisma as any).sellerReminder.findMany({
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
        orderBy: [{ status: 'asc' }, { remindAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      (this.prisma as any).sellerReminder.count({ where })
    ]);

    return { data, total, page, limit };
  }

  async listByCompany(actor: AuthenticatedActor, query: ListSellerRemindersOverviewDto) {
    this.ensureCompanyUser(actor);
    const { page = 1, limit = 20, status, start, end, search, sellerId } = query;

    if (status && !this.isValidStatus(status)) {
      throw new BadRequestException('Status inválido');
    }
    if (sellerId) {
      await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
    }

    const where: any = {
      userId: actor.userId,
      sellerId: sellerId ? sellerId : { not: null },
      ...(status ? { status } : {}),
      ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { content: { contains: search, mode: 'insensitive' } }] } : {})
    };

    if (start || end) {
      where.remindAt = {
        gte: start ? new Date(start) : undefined,
        lte: end ? new Date(end) : undefined
      };
    }

    const [data, total] = await Promise.all([
      (this.prisma as any).sellerReminder.findMany({
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
        orderBy: [{ status: 'asc' }, { remindAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      (this.prisma as any).sellerReminder.count({ where })
    ]);

    return { data, total, page, limit };
  }

  async create(actor: AuthenticatedActor, dto: CreateSellerReminderDto) {
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
    }

    return (this.prisma as any).sellerReminder.create({
      data: {
        userId: actor.userId,
        sellerId: actor.sellerId ?? null,
        leadId: finalLeadId,
        appointmentId: finalAppointmentId,
        title: dto.title,
        content: dto.content?.trim() || null,
        remindAt: new Date(dto.remindAt),
        status: 'PENDING'
      }
    });
  }

  async update(actor: AuthenticatedActor, id: string, dto: UpdateSellerReminderDto) {
    if (dto.status !== undefined && !this.isValidStatus(dto.status)) {
      throw new BadRequestException('Status inválido');
    }

    const existing = await (this.prisma as any).sellerReminder.findFirst({
      where: { id, userId: actor.userId },
      select: { id: true, sellerId: true, appointmentId: true, leadId: true }
    });
    if (!existing) throw new NotFoundException('Lembrete não encontrado');

    if (actor.sellerId) {
      const sellerId = actor.sellerId;
      await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
      if (existing.sellerId !== sellerId) throw new BadRequestException('Acesso negado');
    } else {
      if (existing.sellerId) throw new BadRequestException('Acesso negado');
    }

    const next: { appointmentId?: string | null; leadId?: string | null } = {};
    if (dto.appointmentId !== undefined) {
      const v = dto.appointmentId?.trim();
      next.appointmentId = v ? v : null;
    }
    if (dto.leadId !== undefined) {
      const v = dto.leadId?.trim();
      next.leadId = v ? v : null;
    }

    let finalAppointmentId = next.appointmentId !== undefined ? next.appointmentId : (existing.appointmentId as string | null);
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
      if (finalAppointmentId) {
        await this.ensureSellerHasActiveAccessToAppointment(actor.userId, sellerId, finalAppointmentId);
      } else if (finalLeadId) {
        await this.ensureSellerHasActiveAccessToLead(actor.userId, sellerId, finalLeadId);
      }
    }

    return (this.prisma as any).sellerReminder.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content?.trim() || null } : {}),
        ...(dto.remindAt !== undefined ? { remindAt: new Date(dto.remindAt) } : {}),
        ...(dto.appointmentId !== undefined ? { appointmentId: finalAppointmentId } : {}),
        ...(dto.leadId !== undefined || dto.appointmentId !== undefined ? { leadId: finalLeadId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {})
      }
    });
  }

  async remove(actor: AuthenticatedActor, id: string) {
    const existing = await (this.prisma as any).sellerReminder.findFirst({
      where: { id, userId: actor.userId },
      select: { id: true, sellerId: true }
    });
    if (!existing) throw new NotFoundException('Lembrete não encontrado');
    if (actor.sellerId) {
      await this.ensureSellerBelongsToTenant(actor.userId, actor.sellerId);
      if (existing.sellerId !== actor.sellerId) throw new BadRequestException('Acesso negado');
    } else {
      if (existing.sellerId) throw new BadRequestException('Acesso negado');
    }
    await (this.prisma as any).sellerReminder.delete({ where: { id } });
  }
}
