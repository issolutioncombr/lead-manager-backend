import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadStatusDto } from './dto/create-lead-status.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';

const SYSTEM_STATUSES: Array<{ slug: string; name: string; sortOrder: number }> = [
  { slug: 'NOVO', name: 'Novo', sortOrder: 10 },
  { slug: 'AGENDOU_CALL', name: 'Agendou uma call', sortOrder: 20 },
  { slug: 'ENTROU_CALL', name: 'Entrou na call', sortOrder: 30 },
  { slug: 'COMPROU', name: 'Comprou', sortOrder: 40 },
  { slug: 'NO_SHOW', name: 'Nao compareceu', sortOrder: 50 }
];

const normalizeSlug = (value: string) => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'STATUS';
};

@Injectable()
export class LeadStatusesService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaults(userId: string) {
    await Promise.all(
      SYSTEM_STATUSES.map((s) =>
        this.prisma.leadStatus.upsert({
          where: { userId_slug: { userId, slug: s.slug } },
          update: { name: s.name, isSystem: true, sortOrder: s.sortOrder },
          create: { userId, slug: s.slug, name: s.name, isSystem: true, sortOrder: s.sortOrder }
        })
      )
    );
  }

  async list(userId: string) {
    await this.ensureDefaults(userId);
    return this.prisma.leadStatus.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    });
  }

  async findBySlug(userId: string, slug: string) {
    await this.ensureDefaults(userId);
    const normalized = normalizeSlug(slug);
    return this.prisma.leadStatus.findUnique({ where: { userId_slug: { userId, slug: normalized } } });
  }

  async create(userId: string, dto: CreateLeadStatusDto) {
    await this.ensureDefaults(userId);
    const base = normalizeSlug(dto.name);

    let slug = base;
    for (let i = 0; i < 50; i++) {
      const exists = await this.prisma.leadStatus.findUnique({ where: { userId_slug: { userId, slug } } });
      if (!exists) break;
      slug = `${base}_${i + 2}`;
    }

    return this.prisma.leadStatus.create({
      data: {
        userId,
        slug,
        name: dto.name.trim(),
        isSystem: false,
        sortOrder: typeof dto.sortOrder === 'number' ? dto.sortOrder : 100
      }
    });
  }

  async update(userId: string, id: string, dto: UpdateLeadStatusDto) {
    const existing = await this.prisma.leadStatus.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Status nao encontrado');
    if (existing.isSystem && dto.name && dto.name.trim() !== existing.name) {
      throw new BadRequestException('Status do sistema nao pode ser renomeado');
    }

    return this.prisma.leadStatus.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {})
      }
    });
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.leadStatus.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Status nao encontrado');
    if (existing.isSystem) throw new BadRequestException('Status do sistema nao pode ser removido');

    const count = await this.prisma.lead.count({ where: { userId, stage: existing.slug } });
    if (count > 0) throw new BadRequestException('Nao e possivel remover um status em uso por leads');

    await this.prisma.leadStatus.delete({ where: { id } });
  }
}

export const leadStageLabelFallback = (slug: string) => {
  const match = SYSTEM_STATUSES.find((s) => s.slug === slug);
  return match ? match.name : slug.replace(/_/g, ' ');
};

