import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

const sellerSelect = {
  id: true,
  name: true,
  email: true,
  contactNumber: true,
  createdAt: true,
  updatedAt: true
} as const;

export type SellerSummary = Prisma.SellerGetPayload<{ select: typeof sellerSelect }>;

export interface PaginatedSellers {
  data: SellerSummary[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class SellersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(userId: string, query: PaginationQueryDto): Promise<PaginatedSellers> {
    const { page = 1, limit = 20, search } = query;

    const where: Prisma.SellerWhereInput = {
      userId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { contactNumber: { contains: search, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const [data, total] = await Promise.all([
      this.prisma.seller.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: sellerSelect
      }),
      this.prisma.seller.count({ where })
    ]);

    return { data, total, page, limit };
  }

  findById(userId: string, id: string): Promise<SellerSummary | null> {
    return this.prisma.seller.findFirst({
      where: { id, userId },
      select: sellerSelect
    });
  }

  create(userId: string, data: Omit<Prisma.SellerUncheckedCreateInput, 'userId'>): Promise<SellerSummary> {
    return this.prisma.seller.create({
      data: { ...data, userId },
      select: sellerSelect
    });
  }

  update(id: string, data: Prisma.SellerUpdateInput): Promise<SellerSummary> {
    return this.prisma.seller.update({
      where: { id },
      data,
      select: sellerSelect
    });
  }

  delete(id: string): Promise<SellerSummary> {
    return this.prisma.seller.delete({
      where: { id },
      select: sellerSelect
    });
  }
}
