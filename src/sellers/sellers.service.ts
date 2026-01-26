import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreateSellerDto } from './dto/create-seller.dto';
import { UpdateSellerDto } from './dto/update-seller.dto';
import { PaginatedSellers, SellerSummary, SellersRepository } from './sellers.repository';

@Injectable()
export class SellersService {
  constructor(
    private readonly sellersRepository: SellersRepository,
    private readonly config: ConfigService
  ) {}

  private getDefaultSellerPassword(): string {
    return this.config.get<string>('DEFAULT_SELLER_PASSWORD') ?? 'changeme123';
  }

  list(userId: string, query: PaginationQueryDto): Promise<PaginatedSellers> {
    return this.sellersRepository.findMany(userId, query);
  }

  async findById(userId: string, id: string): Promise<SellerSummary> {
    const seller = await this.sellersRepository.findById(userId, id);

    if (!seller) {
      throw new NotFoundException('Vendedor nao encontrado');
    }

    return seller;
  }

  async create(userId: string, dto: CreateSellerDto): Promise<SellerSummary> {
    const passwordToHash = dto.password ?? this.getDefaultSellerPassword();
    const hashedPassword = await bcrypt.hash(passwordToHash, 10);

    const data: Omit<Prisma.SellerUncheckedCreateInput, 'userId'> = {
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      mustChangePassword: true,
      contactNumber: dto.contactNumber ?? undefined
    };

    return this.sellersRepository.create(userId, data);
  }

  async update(userId: string, id: string, dto: UpdateSellerDto): Promise<SellerSummary> {
    await this.findById(userId, id);

    const data: Prisma.SellerUpdateInput = {
      name: dto.name ?? undefined,
      email: dto.email ?? undefined,
      contactNumber: dto.contactNumber ?? undefined
    };

    if (dto.password !== undefined) {
      data.password = await bcrypt.hash(dto.password, 10);
      data.mustChangePassword = true;
    }

    return this.sellersRepository.update(id, data);
  }

  async delete(userId: string, id: string): Promise<SellerSummary> {
    await this.findById(userId, id);
    return this.sellersRepository.delete(id);
  }
}
