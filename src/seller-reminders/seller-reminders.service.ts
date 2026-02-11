import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateSellerReminderDto } from './dto/create-seller-reminder.dto';
import { ListSellerRemindersDto } from './dto/list-seller-reminders.dto';
import { UpdateSellerReminderDto } from './dto/update-seller-reminder.dto';

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

  private ensureSellerUser(actor: AuthenticatedActor) {
    if (!actor.sellerId) {
      throw new BadRequestException('Somente vendedores podem acessar esta funcionalidade');
    }
    return actor.sellerId;
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
    return (this.prisma as any).sellerReminder.create({
      data: {
        userId: actor.userId,
        sellerId,
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

    return (this.prisma as any).sellerReminder.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content?.trim() || null } : {}),
        ...(dto.remindAt !== undefined ? { remindAt: new Date(dto.remindAt) } : {}),
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
