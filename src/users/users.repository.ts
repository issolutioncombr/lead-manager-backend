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
    return (this.prisma.user as any).findUnique({ where: { email }, include: { company: true } });
  }

  findById(id: string): Promise<User | null> {
    return (this.prisma.user as any).findUnique({ where: { id }, include: { company: true } });
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
    return (this.prisma as any).user
      .findMany({
        orderBy: { createdAt: 'desc' },
        include: { company: { select: { name: true } } }
      })
      .then((rows) =>
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          role: r.role,
          createdAt: r.createdAt,
          companyName: (r as any)?.company?.name ?? null,
          isApproved: (r as { isApproved?: boolean }).isApproved,
          isAdmin: (r as { isAdmin?: boolean }).isAdmin
        }))
      );
  }

  findPendingApprovals(): Promise<
    Array<{ id: string; name: string; email: string; createdAt: Date; companyName?: string | null }>
  > {
    return (this.prisma as any).user
      .findMany({
        orderBy: { createdAt: 'desc' },
        include: { company: { select: { name: true } } }
      })
      .then((rows) =>
        rows
          .filter((r) => (r as { isApproved?: boolean }).isApproved === false)
          .map((r) => ({
            id: r.id,
            name: r.name,
            email: r.email,
            createdAt: r.createdAt,
            companyName: (r as any)?.company?.name ?? null
          }))
      );
  }

  approveUser(id: string): Promise<{ id: string }> {
    return (this.prisma.user.update as any)({
      where: { id },
      data: { isApproved: true },
      select: { id: true }
    });
  }

  setAdmin(id: string, isAdmin: boolean): Promise<{ id: string; isAdmin: boolean }> {
    return (this.prisma.user.update as any)({
      where: { id },
      data: { isAdmin },
      select: { id: true, isAdmin: true }
    });
  }
}
