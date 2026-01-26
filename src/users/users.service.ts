import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.usersRepository.create(data);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async findApiKeyById(id: string): Promise<string | null> {
    const result = await this.usersRepository.findApiKeyById(id);
    return result?.apiKey ?? null;
  }
}
