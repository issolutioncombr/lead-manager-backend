import { Injectable } from '@nestjs/common';
import { CourseLead, Prisma } from '@prisma/client';

import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

export interface PaginatedCourseLeads {
  data: CourseLead[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class CourseLeadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(userId: string, query: PaginationQueryDto): Promise<PaginatedCourseLeads> {
    const { page = 1, limit = 20, search } = query;

    const where: Prisma.CourseLeadWhereInput = {
      userId,
      ...(search
        ? {
            OR: [
              { nomeCompleto: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { telefone: { contains: search, mode: 'insensitive' } },
              { origem: { contains: search, mode: 'insensitive' } },
              { nota: { contains: search, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const [data, total] = await Promise.all([
      this.prisma.courseLead.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.courseLead.count({ where })
    ]);

    return { data, total, page, limit };
  }

  findById(userId: string, id: string): Promise<CourseLead | null> {
    return this.prisma.courseLead.findFirst({ where: { id, userId } });
  }

  create(
    userId: string,
    data: Omit<Prisma.CourseLeadUncheckedCreateInput, 'userId'>
  ): Promise<CourseLead> {
    return this.prisma.courseLead.create({ data: { ...data, userId } });
  }

  update(id: string, data: Prisma.CourseLeadUpdateInput): Promise<CourseLead> {
    return this.prisma.courseLead.update({ where: { id }, data });
  }

  delete(id: string): Promise<CourseLead> {
    return this.prisma.courseLead.delete({ where: { id } });
  }
}
