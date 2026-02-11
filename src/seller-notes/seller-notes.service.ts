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

  private ensureSellerUser(actor: AuthenticatedActor) {
    if (!actor.sellerId) {
      throw new BadRequestException('Somente vendedores podem acessar esta funcionalidade');
    }
    return actor.sellerId;
  }

  private isCompanyUser(actor: AuthenticatedActor) {
    return !actor.sellerId;
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
    if (!access) throw new ForbiddenException('Vendedor sem acesso ativo para esta video chamada');
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
          appointmentId: { not: null },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
        },
        select: { appointmentId: true }
      });
      const allowedAppointmentIds = accesses
        .map((a: { appointmentId: string | null }) => a.appointmentId)
        .filter((id: string | null): id is string => !!id);

      if (!allowedAppointmentIds.length) {
        return { data: [], total: 0, page, limit };
      }

      const where: any = {
        userId: actor.userId,
        sellerId: currentSellerId,
        appointmentId: { in: allowedAppointmentIds },
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
    const appointment = await this.ensureAppointmentForTenant(actor.userId, dto.appointmentId);

    if (actor.sellerId) {
      const sellerId = actor.sellerId;
      await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
      await this.ensureSellerHasActiveAccessToAppointment(actor.userId, sellerId, appointment.id);
      return (this.prisma as any).sellerCallNote.create({
        data: {
          userId: actor.userId,
          sellerId,
          leadId: appointment.leadId,
          appointmentId: appointment.id,
          title: dto.title?.trim() || null,
          content: dto.content
        }
      });
    }

    return (this.prisma as any).sellerCallNote.create({
      data: {
        userId: actor.userId,
        sellerId: null,
        leadId: appointment.leadId,
        appointmentId: appointment.id,
        title: dto.title?.trim() || null,
        content: dto.content
      }
    });
  }

  async update(actor: AuthenticatedActor, id: string, dto: UpdateSellerCallNoteDto) {
    const existing = await (this.prisma as any).sellerCallNote.findFirst({
      where: { id, userId: actor.userId },
      select: { id: true, appointmentId: true, sellerId: true }
    });
    if (!existing) throw new NotFoundException('Nota não encontrada');

    if (actor.sellerId) {
      const sellerId = actor.sellerId;
      await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
      if (existing.sellerId !== sellerId) throw new ForbiddenException('Acesso negado');
      if (!existing.appointmentId) throw new BadRequestException('Nota sem video chamada vinculada');
      await this.ensureSellerHasActiveAccessToAppointment(actor.userId, sellerId, existing.appointmentId);
    } else {
      if (existing.sellerId) throw new ForbiddenException('Acesso negado');
    }

    return (this.prisma as any).sellerCallNote.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title?.trim() || null } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {})
      }
    });
  }

  async remove(actor: AuthenticatedActor, id: string) {
    const existing = await (this.prisma as any).sellerCallNote.findFirst({
      where: { id, userId: actor.userId },
      select: { id: true, appointmentId: true, sellerId: true }
    });
    if (!existing) throw new NotFoundException('Nota não encontrada');

    if (actor.sellerId) {
      const sellerId = actor.sellerId;
      await this.ensureSellerBelongsToTenant(actor.userId, sellerId);
      if (existing.sellerId !== sellerId) throw new ForbiddenException('Acesso negado');
      if (!existing.appointmentId) throw new BadRequestException('Nota sem video chamada vinculada');
      await this.ensureSellerHasActiveAccessToAppointment(actor.userId, sellerId, existing.appointmentId);
    } else {
      if (existing.sellerId) throw new ForbiddenException('Acesso negado');
    }

    await (this.prisma as any).sellerCallNote.delete({ where: { id } });
  }
}
