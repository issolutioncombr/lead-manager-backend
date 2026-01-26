import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SellerAvailability } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateSellerAvailabilityDto } from './dto/create-seller-availability.dto';
import { UpdateSellerAvailabilityDto } from './dto/update-seller-availability.dto';

@Injectable()
export class SellerAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  listSlots(sellerId: string): Promise<SellerAvailability[]> {
    return this.prisma.sellerAvailability.findMany({
      where: { sellerId },
      orderBy: [
        { specificDate: 'asc' },
        { day: 'asc' },
        { dayOfMonth: 'asc' },
        { startTime: 'asc' }
      ]
    });
  }

  listSlotsByUser(userId: string) {
    return this.prisma.seller.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        email: true,
        availabilitySlots: {
          orderBy: [
            { specificDate: 'asc' },
            { day: 'asc' },
            { dayOfMonth: 'asc' },
            { startTime: 'asc' }
          ]
        }
      },
      orderBy: { name: 'asc' }
    });
  }

  async createSlot(sellerId: string, dto: CreateSellerAvailabilityDto): Promise<SellerAvailability> {
    this.ensureValidRange(dto.startTime, dto.endTime);

    return this.prisma.sellerAvailability.create({
      data: {
        sellerId,
        day: dto.day,
        dayOfMonth: dto.dayOfMonth ?? null,
        specificDate: dto.specificDate ? new Date(dto.specificDate) : null,
        startTime: dto.startTime,
        endTime: dto.endTime
      }
    });
  }

  async updateSlot(
    sellerId: string,
    slotId: string,
    dto: UpdateSellerAvailabilityDto
  ): Promise<SellerAvailability> {
    await this.ensureSlotOwnership(sellerId, slotId);

    if (dto.startTime !== undefined || dto.endTime !== undefined) {
      this.ensureValidRange(dto.startTime ?? undefined, dto.endTime ?? undefined);
    }

    const data: Prisma.SellerAvailabilityUpdateInput = {
      day: dto.day ?? undefined,
      dayOfMonth: dto.dayOfMonth ?? undefined,
      specificDate:
        dto.specificDate !== undefined ? (dto.specificDate ? new Date(dto.specificDate) : null) : undefined,
      startTime: dto.startTime ?? undefined,
      endTime: dto.endTime ?? undefined
    };

    return this.prisma.sellerAvailability.update({
      where: { id: slotId },
      data
    });
  }

  async deleteSlot(sellerId: string, slotId: string): Promise<void> {
    await this.ensureSlotOwnership(sellerId, slotId);
    await this.prisma.sellerAvailability.delete({
      where: { id: slotId }
    });
  }

  private async ensureSlotOwnership(sellerId: string, slotId: string) {
    const slot = await this.prisma.sellerAvailability.findUnique({
      where: { id: slotId },
      select: { sellerId: true }
    });

    if (!slot || slot.sellerId !== sellerId) {
      throw new NotFoundException('Horario nao encontrado');
    }
  }

  private ensureValidRange(start?: string, end?: string) {
    if (!start || !end) {
      return;
    }

    if (start >= end) {
      throw new BadRequestException('O horario inicial deve ser menor que o final');
    }
  }
}
