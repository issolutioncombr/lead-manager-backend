import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

export interface TenantUser {
  userId: string;
  email: string;
  name: string;
}

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveByApiKey(apiKey?: string): Promise<TenantUser> {
    if (!apiKey) {
      throw new UnauthorizedException('Missing tenant key');
    }

    const user = await this.prisma.user.findUnique({
      where: { apiKey }
    });

    if (!user) {
      throw new UnauthorizedException('Invalid tenant key');
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name
    };
  }
}
