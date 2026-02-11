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

  private ensureSellerUser(actor: AuthenticatedActor) {
    if (!actor.sellerId) {
      throw new BadRequestException('Somente vendedores podem acessar esta funcionalidade');
    }
    return actor.sellerId;
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
    const sellerId = this.ensureSellerUser(actor);
    await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
    const { page = 1, limit = 20, status, start, end, search } = query;

    if (status && !this.isValidStatus(status)) {
      throw new BadRequestException('Status inválido');
    }

    const where: any = {
      userId: actor.userId,
      sellerId,
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
      ...(sellerId ? { sellerId } : {}),
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
    const sellerId = this.ensureSellerUser(actor);
    await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
    const appointment = dto.appointmentId ? await this.ensureAppointmentForTenant(actor.userId, dto.appointmentId) : null;
    if (appointment) {
      await this.ensureSellerHasActiveAccessToAppointment(actor.userId, sellerId, appointment.id);
    }
    return (this.prisma as any).sellerReminder.create({
      data: {
        userId: actor.userId,
        sellerId,
        leadId: appointment?.leadId ?? null,
        appointmentId: appointment?.id ?? null,
        title: dto.title,
        content: dto.content?.trim() || null,
        remindAt: new Date(dto.remindAt),
        status: 'PENDING'
      }
    });
  }

  async update(actor: AuthenticatedActor, id: string, dto: UpdateSellerReminderDto) {
    const sellerId = this.ensureSellerUser(actor);
    await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
    if (dto.status !== undefined && !this.isValidStatus(dto.status)) {
      throw new BadRequestException('Status inválido');
    }

    const existing = await (this.prisma as any).sellerReminder.findFirst({ where: { id, userId: actor.userId, sellerId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Lembrete não encontrado');

    let appointment: { id: string; leadId: string } | null = null;
    if ((dto as any).appointmentId !== undefined) {
      if ((dto as any).appointmentId) {
        appointment = await this.ensureAppointmentForTenant(actor.userId, String((dto as any).appointmentId));
        await this.ensureSellerHasActiveAccessToAppointment(actor.userId, sellerId, appointment.id);
      }
    }

    return (this.prisma as any).sellerReminder.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content?.trim() || null } : {}),
        ...(dto.remindAt !== undefined ? { remindAt: new Date(dto.remindAt) } : {}),
        ...((dto as any).appointmentId !== undefined
          ? {
              appointmentId: appointment?.id ?? null,
              leadId: appointment?.leadId ?? null
            }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {})
      }
    });
  }

  async remove(actor: AuthenticatedActor, id: string) {
    const sellerId = this.ensureSellerUser(actor);
    await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
    const existing = await (this.prisma as any).sellerReminder.findFirst({ where: { id, userId: actor.userId, sellerId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Lembrete não encontrado');
    await (this.prisma as any).sellerReminder.delete({ where: { id } });
  }
}
