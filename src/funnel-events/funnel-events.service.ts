import { Injectable } from '@nestjs/common';
import { FunnelEvent, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FunnelEventsService {
  constructor(private readonly prisma: PrismaService) {}

  recordEvent(
    userId: string,
    clientId: string,
    type: string,
    meta?: Prisma.InputJsonValue
  ): Promise<FunnelEvent> {
    return this.prisma.funnelEvent.create({
      data: {
        userId,
        clientId,
        type,
        meta
      }
    });
  }

  countByType(userId: string, types: string[]): Promise<Record<string, number>> {
    return this.prisma.$transaction(async (tx) => {
      const entries = await Promise.all(
        types.map(async (type) => {
          const count = await tx.funnelEvent.count({ where: { type, userId } });
          return [type, count] as const;
        })
      );

      return Object.fromEntries(entries);
    });
  }

  eventsBetween(userId: string, type: string, start: Date, end: Date): Promise<number> {
    return this.prisma.funnelEvent.count({
      where: {
        userId,
        type,
        createdAt: {
          gte: start,
          lte: end
        }
      }
    });
  }
}
