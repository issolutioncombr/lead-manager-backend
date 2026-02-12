import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('prompt-categories')
export class PromptCategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const rows = await (this.prisma as any).promptCategory.findMany({
      where: { active: true },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        active: true
      }
    });
    return { data: rows };
  }
}

