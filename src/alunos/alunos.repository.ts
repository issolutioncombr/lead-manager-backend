import { Injectable } from '@nestjs/common';
import { Aluno, Prisma } from '@prisma/client';

import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

export interface PaginatedAlunos {
  data: Aluno[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AlunosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(userId: string, query: PaginationQueryDto): Promise<PaginatedAlunos> {
    const { page = 1, limit = 20, search } = query;

    const where: Prisma.AlunoWhereInput = {
      userId,
      ...(search
        ? {
            OR: [
              { nomeCompleto: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { telefone: { contains: search, mode: 'insensitive' } },
              { profissao: { contains: search, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const [data, total] = await Promise.all([
      this.prisma.aluno.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.aluno.count({ where })
    ]);

    return { data, total, page, limit };
  }

  findById(userId: string, id: string): Promise<Aluno | null> {
    return this.prisma.aluno.findFirst({ where: { id, userId } });
  }

  create(
    userId: string,
    data: Omit<Prisma.AlunoUncheckedCreateInput, 'userId'>
  ): Promise<Aluno> {
    return this.prisma.aluno.create({ data: { ...data, userId } });
  }

  update(id: string, data: Prisma.AlunoUpdateInput): Promise<Aluno> {
    return this.prisma.aluno.update({ where: { id }, data });
  }

  delete(id: string): Promise<Aluno> {
    return this.prisma.aluno.delete({ where: { id } });
  }
}
