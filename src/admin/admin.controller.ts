import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { assertSuperAdmin } from '../common/super-admin';

type AuthenticatedUser = { userId: string };

@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('users')
  async listUsers(@CurrentUser() user: AuthenticatedUser) {
    await assertSuperAdmin(this.prisma, user.userId);
    return this.prisma.user.findMany({
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isAdmin: true,
        isApproved: true,
        companyName: true,
        createdAt: true
      }
    });
  }

  @Patch('users/:id/approve')
  async approveUser(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { isApproved: boolean }) {
    await assertSuperAdmin(this.prisma, user.userId);
    return this.prisma.user.update({
      where: { id },
      data: { isApproved: Boolean(body?.isApproved) },
      select: { id: true, isApproved: true }
    });
  }

  @Get('prompts')
  async listAdminPrompts(@CurrentUser() user: AuthenticatedUser, @Query('userId') userId?: string) {
    await assertSuperAdmin(this.prisma, user.userId);
    return (this.prisma as any).agentPrompt.findMany({
      where: { ...(userId ? { userId } : {}), promptType: 'SUPER_ADMIN' },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        userId: true,
        createdByUserId: true,
        name: true,
        active: true,
        promptType: true,
        version: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  @Post('prompts')
  async createAdminPrompt(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      targetUserId: string;
      agentName: string;
      prompt: string;
      active?: boolean;
    }
  ) {
    await assertSuperAdmin(this.prisma, user.userId);
    const targetUserId = String(body?.targetUserId ?? '').trim();
    const agentName = String(body?.agentName ?? '').trim();
    const prompt = String(body?.prompt ?? '').trim();
    if (!targetUserId) throw new BadRequestException('targetUserId é obrigatório');
    if (!agentName) throw new BadRequestException('agentName é obrigatório');
    if (!prompt) throw new BadRequestException('prompt é obrigatório');

    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!targetUser?.id) throw new NotFoundException('Usuário destinatário não encontrado');

    let created: any;
    try {
      created = await (this.prisma as any).agentPrompt.create({
        data: {
          userId: targetUserId,
          name: agentName,
          prompt,
          active: body?.active !== undefined ? Boolean(body.active) : true,
          promptType: 'SUPER_ADMIN',
          createdByUserId: user.userId,
          version: 1
        }
      });
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : 'Falha ao criar prompt.';
      throw new BadRequestException(msg);
    }

    return {
      data: {
        id: created.id,
        userId: created.userId,
        name: created.name,
        active: created.active,
        promptType: created.promptType,
        version: created.version,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt
      }
    };
  }

  @Put('prompts/:id')
  async updateAdminPrompt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body()
    body: {
      agentName?: string;
      prompt?: string;
      active?: boolean;
    }
  ) {
    await assertSuperAdmin(this.prisma, user.userId);
    const promptId = String(id ?? '').trim();
    const existing = await (this.prisma as any).agentPrompt.findFirst({
      where: { id: promptId, promptType: 'SUPER_ADMIN', createdByUserId: user.userId }
    });
    if (!existing) throw new NotFoundException('Prompt não encontrado');
    const data: any = { version: { increment: 1 } };
    if (body?.agentName !== undefined) {
      const name = String(body.agentName ?? '').trim();
      if (!name) throw new BadRequestException('agentName inválido');
      data.name = name;
    }
    if (body?.prompt !== undefined) {
      const prompt = String(body.prompt ?? '').trim();
      if (!prompt) throw new BadRequestException('prompt inválido');
      data.prompt = prompt;
    }
    if (body?.active !== undefined) {
      data.active = Boolean(body.active);
    }
    let updated: any;
    try {
      updated = await (this.prisma as any).agentPrompt.update({
        where: { id: promptId },
        data
      });
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : 'Falha ao atualizar prompt.';
      throw new BadRequestException(msg);
    }
    return {
      data: {
        id: updated.id,
        userId: updated.userId,
        name: updated.name,
        active: updated.active,
        promptType: updated.promptType,
        version: updated.version,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
      }
    };
  }

  @Delete('prompts/:id')
  async deleteAdminPrompt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await assertSuperAdmin(this.prisma, user.userId);
    const promptId = String(id ?? '').trim();
    const existing = await (this.prisma as any).agentPrompt.findFirst({
      where: { id: promptId, promptType: 'SUPER_ADMIN', createdByUserId: user.userId },
      select: { id: true }
    });
    if (!existing?.id) return { ok: true };
    try {
      await (this.prisma as any).agentPrompt.delete({ where: { id: promptId } });
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : 'Falha ao remover prompt.';
      throw new BadRequestException(msg);
    }
    return { ok: true };
  }
}
