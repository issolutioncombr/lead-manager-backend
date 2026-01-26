import { Injectable, NotFoundException } from '@nestjs/common';
import { Client, ClientStatus, Prisma } from '@prisma/client';

import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { calculateLeadScore } from '../common/utils/lead-scoring.util';
import { ClientsRepository, PaginatedClients } from './clients.repository';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly clientsRepository: ClientsRepository) {}

  list(userId: string, query: PaginationQueryDto): Promise<PaginatedClients> {
    return this.clientsRepository.findMany(userId, query);
  }

  async findById(userId: string, id: string): Promise<Client> {
    const client = await this.clientsRepository.findById(userId, id);

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado');
    }

    return client;
  }

  findByEmail(userId: string, email: string) {
    return this.clientsRepository.findByEmail(userId, email);
  }

  findByPhone(userId: string, phone: string) {
    return this.clientsRepository.findByPhone(userId, phone);
  }

  async create(userId: string, dto: CreateClientDto): Promise<Client> {
    const score = calculateLeadScore({
      source: dto.source,
      tags: dto.tags ?? [],
      status: dto.status ?? ClientStatus.NEW
    });

    return this.clientsRepository.create(userId, {
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      address: dto.address ?? undefined,
      source: dto.source,
      tags: dto.tags ?? [],
      notes: dto.notes,
      status: dto.status ?? ClientStatus.NEW,
      score,
      age: dto.age ?? undefined,
      country: dto.country ?? undefined,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      language: dto.language ?? undefined,
      anamnesisResponses: dto.anamnesisResponses as Prisma.InputJsonValue | undefined
    });
  }

  async update(userId: string, id: string, dto: UpdateClientDto): Promise<Client> {
    const client = await this.findById(userId, id);

    const score = calculateLeadScore({
      source: dto.source ?? client.source ?? undefined,
      tags: dto.tags ?? client.tags,
      status: dto.status ?? client.status
    });

    const updateData: Prisma.ClientUpdateInput = {
      tags: dto.tags ?? client.tags,
      score
    };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.source !== undefined) updateData.source = dto.source;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.age !== undefined) updateData.age = dto.age;
    if (dto.country !== undefined) updateData.country = dto.country;
    if (dto.birthDate !== undefined)
      updateData.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    if (dto.language !== undefined) updateData.language = dto.language;
    if (dto.anamnesisResponses !== undefined)
      updateData.anamnesisResponses = dto.anamnesisResponses as Prisma.InputJsonValue;

    return this.clientsRepository.update(id, updateData);
  }

  async delete(userId: string, id: string): Promise<Client> {
    await this.findById(userId, id);
    return this.clientsRepository.delete(id);
  }

  updateScore(id: string, score: number): Promise<Client> {
    return this.clientsRepository.update(id, { score });
  }
}
