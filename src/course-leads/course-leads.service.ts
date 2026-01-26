import { Injectable, NotFoundException } from '@nestjs/common';
import { CourseLead, Prisma } from '@prisma/client';

import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CourseLeadsRepository, PaginatedCourseLeads } from './course-leads.repository';
import { CreateCourseLeadDto } from './dto/create-course-lead.dto';
import { UpdateCourseLeadDto } from './dto/update-course-lead.dto';

@Injectable()
export class CourseLeadsService {
  constructor(private readonly courseLeadsRepository: CourseLeadsRepository) {}

  list(userId: string, query: PaginationQueryDto): Promise<PaginatedCourseLeads> {
    return this.courseLeadsRepository.findMany(userId, query);
  }

  async findById(userId: string, id: string): Promise<CourseLead> {
    const lead = await this.courseLeadsRepository.findById(userId, id);

    if (!lead) {
      throw new NotFoundException('Lead de curso nao encontrado');
    }

    return lead;
  }

  create(userId: string, dto: CreateCourseLeadDto): Promise<CourseLead> {
    const data: Omit<Prisma.CourseLeadUncheckedCreateInput, 'userId'> = {
      nomeCompleto: dto.nomeCompleto,
      telefone: dto.telefone ?? undefined,
      pais: dto.pais ?? undefined,
      email: dto.email ?? undefined,
      origem: dto.origem ?? undefined,
      nota: dto.nota ?? undefined
    };

    return this.courseLeadsRepository.create(userId, data);
  }

  async update(userId: string, id: string, dto: UpdateCourseLeadDto): Promise<CourseLead> {
    await this.findById(userId, id);

    const data: Prisma.CourseLeadUpdateInput = {};

    if (dto.nomeCompleto !== undefined) data.nomeCompleto = dto.nomeCompleto;
    if (dto.telefone !== undefined) data.telefone = dto.telefone;
    if (dto.pais !== undefined) data.pais = dto.pais;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.origem !== undefined) data.origem = dto.origem;
    if (dto.nota !== undefined) data.nota = dto.nota;

    return this.courseLeadsRepository.update(id, data);
  }

  async delete(userId: string, id: string): Promise<CourseLead> {
    await this.findById(userId, id);
    return this.courseLeadsRepository.delete(id);
  }
}
