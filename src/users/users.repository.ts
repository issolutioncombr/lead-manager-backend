import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UserUncheckedCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findApiKeyById(id: string): Promise<{ apiKey: string } | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { apiKey: true }
    });
  }

  findAll(): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      createdAt: Date;
      companyName?: string | null;
      isApproved?: boolean;
      isAdmin?: boolean;
    }>
  > {
    return this.prisma.user
      .findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true
        }
      })
      .then((rows) =>
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          role: r.role,
          createdAt: r.createdAt
        }))
      );
  }

  findPendingApprovals(): Promise<
    Array<{ id: string; name: string; email: string; createdAt: Date; companyName?: string | null }>
  > {
    return this.prisma.user
      .findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true
        }
      })
      .then((rows) =>
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          createdAt: r.createdAt
        }))
      );
  }

  approveUser(id: string): Promise<{ id: string }> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true }
    }) as Promise<{ id: string }>;
  }

  setAdmin(id: string, isAdmin: boolean): Promise<{ id: string; isAdmin: boolean }> {
    return this.prisma.user
      .findUnique({
        where: { id },
        select: { id: true }
      })
      .then((row) => ({ id: row?.id ?? id, isAdmin }));
  }
}
