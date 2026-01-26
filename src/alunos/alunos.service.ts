import { Injectable, NotFoundException } from '@nestjs/common';
import { Aluno, Prisma } from '@prisma/client';

import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AlunosRepository, PaginatedAlunos } from './alunos.repository';
import { CreateAlunoDto } from './dto/create-aluno.dto';
import { UpdateAlunoDto } from './dto/update-aluno.dto';

@Injectable()
export class AlunosService {
  constructor(private readonly alunosRepository: AlunosRepository) {}

  list(userId: string, query: PaginationQueryDto): Promise<PaginatedAlunos> {
    return this.alunosRepository.findMany(userId, query);
  }

  async findById(userId: string, id: string): Promise<Aluno> {
    const aluno = await this.alunosRepository.findById(userId, id);

    if (!aluno) {
      throw new NotFoundException('Aluno nao encontrado');
    }

    return aluno;
  }

  create(userId: string, dto: CreateAlunoDto): Promise<Aluno> {
    const data: Omit<Prisma.AlunoUncheckedCreateInput, 'userId'> = {
      nomeCompleto: dto.nomeCompleto,
      telefone: dto.telefone ?? undefined,
      pais: dto.pais ?? undefined,
      email: dto.email ?? undefined,
      profissao: dto.profissao ?? undefined
    };

    return this.alunosRepository.create(userId, data);
  }

  async update(userId: string, id: string, dto: UpdateAlunoDto): Promise<Aluno> {
    await this.findById(userId, id);

    const data: Prisma.AlunoUpdateInput = {};

    if (dto.nomeCompleto !== undefined) data.nomeCompleto = dto.nomeCompleto;
    if (dto.telefone !== undefined) data.telefone = dto.telefone;
    if (dto.pais !== undefined) data.pais = dto.pais;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.profissao !== undefined) data.profissao = dto.profissao;

    return this.alunosRepository.update(id, data);
  }

  async delete(userId: string, id: string): Promise<Aluno> {
    await this.findById(userId, id);
    return this.alunosRepository.delete(id);
  }
}
