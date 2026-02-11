import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const isSuperAdminRole = (role?: string | null) => {
  const normalized = String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return normalized === 'superadmin';
};

export const assertSuperAdmin = async (prisma: PrismaService, userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!isSuperAdminRole(user?.role)) {
    throw new ForbiddenException('Acesso permitido apenas para Super-Admin.');
  }
};

