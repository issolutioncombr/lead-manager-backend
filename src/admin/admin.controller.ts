import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { assertSuperAdmin, isSuperAdminRole } from '../common/super-admin';
import { buildClientBusinessBlock, normalizeUserConfig, renderN8nFinalPrompt } from '../manual-prompts/manual-prompt-renderer';
import { AgentPromptService } from '../users/agent-prompt.service';

type AuthenticatedUser = { userId: string };

const normalizeText = (value: any) => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

const normalizeList = (input: any, separator: string) =>
  String(input ?? '')
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);

@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentPromptService: AgentPromptService
  ) {}

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

  @Get('users/:id/prompts')
  async listUserPrompts(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await assertSuperAdmin(this.prisma, user.userId);
    const targetUserId = String(id ?? '').trim();
    if (!targetUserId) throw new BadRequestException('userId inválido');
    const rows = await (this.prisma as any).agentPrompt.findMany({
      where: { userId: targetUserId },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        promptCategory: { select: { id: true, name: true, basePrompt: true } },
        createdBy: { select: { id: true, role: true, email: true, name: true } }
      }
    });
    const data = rows.map((r: any) => {
      const createdByType =
        r.createdByUserId === null || r.createdByUserId === undefined
          ? 'SYSTEM'
          : r.createdByUserId === r.userId
            ? 'USER'
            : 'SYSTEM';
      const cfg = r.manualConfig && typeof r.manualConfig === 'object' ? (r.manualConfig as any) : null;
      const previewPrompt =
        r.promptCategory?.id && r.promptCategory?.basePrompt
          ? r.promptType === 'USER_MANUAL' && cfg?.version === 3
            ? r.prompt
            : renderN8nFinalPrompt({
                categoryName: r.promptCategory?.name,
                clientName: r.name,
                companyCorePrompt: r.promptCategory?.basePrompt ?? '',
                clientPrompt: r.prompt
              })
          : r.prompt;
      return {
        id: r.id,
        userId: r.userId,
        name: r.name,
        promptType: r.promptType,
        isManual: r.promptType === 'USER_MANUAL',
        category: r.promptCategory ? { id: r.promptCategory.id, name: r.promptCategory.name } : null,
        active: r.active,
        version: r.version,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        createdByType,
        createdBy: r.createdBy,
        previewPrompt
      };
    });
    return { data };
  }

  @Get('users/:id/prompts/:promptId')
  async getUserPrompt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('promptId') promptId: string) {
    await assertSuperAdmin(this.prisma, user.userId);
    const targetUserId = String(id ?? '').trim();
    const pid = String(promptId ?? '').trim();
    if (!targetUserId) throw new BadRequestException('userId inválido');
    if (!pid) throw new NotFoundException('Prompt não encontrado');
    const row = await (this.prisma as any).agentPrompt.findFirst({
      where: { id: pid, userId: targetUserId },
      include: {
        promptCategory: { select: { id: true, name: true, basePrompt: true } },
        createdBy: { select: { id: true, role: true, email: true, name: true } }
      }
    });
    if (!row) throw new NotFoundException('Prompt não encontrado');
    const createdByType =
      row.createdByUserId === null || row.createdByUserId === undefined
        ? 'SYSTEM'
        : row.createdByUserId === row.userId
          ? 'USER'
          : 'SYSTEM';
    const cfg = row.manualConfig && typeof row.manualConfig === 'object' ? (row.manualConfig as any) : null;
    const previewPrompt =
      row.promptCategory?.id && row.promptCategory?.basePrompt
        ? row.promptType === 'USER_MANUAL' && cfg?.version === 3
          ? row.prompt
          : renderN8nFinalPrompt({
              categoryName: row.promptCategory?.name,
              clientName: row.name,
              companyCorePrompt: row.promptCategory?.basePrompt ?? '',
              clientPrompt: row.prompt
            })
        : row.prompt;
    return {
      data: {
        id: row.id,
        userId: row.userId,
        name: row.name,
        promptType: row.promptType,
        isManual: row.promptType === 'USER_MANUAL',
        category: row.promptCategory ? { id: row.promptCategory.id, name: row.promptCategory.name } : null,
        active: row.active,
        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdByType,
        createdBy: row.createdBy,
        prompt: row.prompt,
        manualConfig: row.manualConfig ?? null,
        previewPrompt
      }
    };
  }

  @Post('users/:id/prompts')
  async createUserPrompt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body()
    body: {
      name: string;
      categoryId: string;
      promptType: string;
      active?: boolean;
      prompt?: string;
      userConfig?: any;
    }
  ) {
    await assertSuperAdmin(this.prisma, user.userId);
    const targetUserId = String(id ?? '').trim();
    if (!targetUserId) throw new BadRequestException('userId inválido');

    const name = String(body?.name ?? '').trim();
    const categoryId = String(body?.categoryId ?? '').trim();
    const promptType = String(body?.promptType ?? '').trim() || 'USER_RAW';
    if (!name) throw new BadRequestException('name é obrigatório');
    if (!categoryId) throw new BadRequestException('categoryId é obrigatório');

    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!targetUser?.id) throw new NotFoundException('Usuário destinatário não encontrado');

    const category = await (this.prisma as any).promptCategory.findFirst({
      where: { id: categoryId, active: true },
      select: { id: true, name: true, basePrompt: true, tools: true, requiredVariables: true, variables: true }
    });
    if (!category?.id) throw new BadRequestException('Categoria inválida');

    if (promptType === 'USER_MANUAL') {
      const userCfgRaw = body?.userConfig && typeof body.userConfig === 'object' ? body.userConfig : {};
      const userCfg = normalizeUserConfig(userCfgRaw);
      const manualConfig = { version: 4, categoryId: category.id, user: userCfg };
      const clientPrompt = buildClientBusinessBlock(name, userCfg);
      const previewPrompt = renderN8nFinalPrompt({
        categoryName: category.name,
        clientName: name,
        companyCorePrompt: category.basePrompt ?? '',
        clientPrompt
      });
      const created = await (this.prisma as any).agentPrompt.create({
        data: {
          userId: targetUserId,
          promptCategoryId: category.id,
          name,
          prompt: clientPrompt,
          active: body?.active !== undefined ? Boolean(body.active) : true,
          promptType: 'USER_MANUAL',
          createdByUserId: user.userId,
          manualConfig,
          version: 1
        }
      });
      return { data: created, previewPrompt };
    }

    const prompt = String(body?.prompt ?? '').trim();
    if (!prompt) throw new BadRequestException('prompt é obrigatório');
    const created = await (this.prisma as any).agentPrompt.create({
      data: {
        userId: targetUserId,
        promptCategoryId: category.id,
        name,
        prompt,
        active: body?.active !== undefined ? Boolean(body.active) : true,
        promptType,
        createdByUserId: user.userId,
        version: 1
      }
    });
    const previewPrompt = renderN8nFinalPrompt({
      categoryName: category.name,
      clientName: name,
      companyCorePrompt: category.basePrompt ?? '',
      clientPrompt: created.prompt
    });
    return { data: created, previewPrompt };
  }

  @Put('users/:id/prompts/:promptId')
  async updateUserPrompt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('promptId') promptId: string,
    @Body()
    body: {
      name?: string;
      categoryId?: string;
      promptType?: string;
      active?: boolean;
      prompt?: string;
      userConfig?: any;
    }
  ) {
    await assertSuperAdmin(this.prisma, user.userId);
    const targetUserId = String(id ?? '').trim();
    const pid = String(promptId ?? '').trim();
    if (!targetUserId) throw new BadRequestException('userId inválido');
    if (!pid) throw new NotFoundException('Prompt não encontrado');

    const existing = await (this.prisma as any).agentPrompt.findFirst({ where: { id: pid, userId: targetUserId } });
    if (!existing) throw new NotFoundException('Prompt não encontrado');

    const nextName = body?.name !== undefined ? String(body.name ?? '').trim() : String(existing.name ?? '').trim();
    if (!nextName) throw new BadRequestException('name inválido');
    const nextType = body?.promptType !== undefined ? String(body.promptType ?? '').trim() : String(existing.promptType ?? '').trim();

    const nextCategoryId = body?.categoryId !== undefined ? String(body.categoryId ?? '').trim() : String(existing.promptCategoryId ?? '').trim();
    if (!nextCategoryId) throw new BadRequestException('categoryId inválido');

    const category = await (this.prisma as any).promptCategory.findFirst({
      where: { id: nextCategoryId, active: true },
      select: { id: true, name: true, basePrompt: true, tools: true, requiredVariables: true, variables: true }
    });
    if (!category?.id) throw new BadRequestException('Categoria inválida');

    const data: any = {
      name: nextName,
      promptCategoryId: category.id,
      ...(body?.active !== undefined ? { active: Boolean(body.active) } : {}),
      ...(nextType ? { promptType: nextType } : {}),
      version: { increment: 1 }
    };

    let previewPrompt: string | null = null;
    if (nextType === 'USER_MANUAL') {
      const prevCfg = existing.manualConfig && typeof existing.manualConfig === 'object' ? (existing.manualConfig as any) : {};
      const prevUser = prevCfg?.user && typeof prevCfg.user === 'object' ? prevCfg.user : {};
      const userCfgRaw = body?.userConfig && typeof body.userConfig === 'object' ? body.userConfig : {};
      const userCfg = normalizeUserConfig({ ...prevUser, ...userCfgRaw });
      const manualConfig = { version: 4, categoryId: category.id, user: userCfg };
      const clientPrompt = buildClientBusinessBlock(nextName, userCfg);
      previewPrompt = renderN8nFinalPrompt({
        categoryName: category.name,
        clientName: nextName,
        companyCorePrompt: category.basePrompt ?? '',
        clientPrompt
      });
      data.manualConfig = manualConfig;
      data.prompt = clientPrompt;
    } else if (body?.prompt !== undefined) {
      const prompt = String(body.prompt ?? '').trim();
      if (!prompt) throw new BadRequestException('prompt inválido');
      data.prompt = prompt;
      previewPrompt = renderN8nFinalPrompt({
        categoryName: category.name,
        clientName: nextName,
        companyCorePrompt: category.basePrompt ?? '',
        clientPrompt: prompt
      });
      data.manualConfig = null;
    } else {
      previewPrompt =
        category?.id && category?.basePrompt
          ? renderN8nFinalPrompt({
              categoryName: category.name,
              clientName: nextName,
              companyCorePrompt: category.basePrompt ?? '',
              clientPrompt: String(existing.prompt ?? '')
            })
          : String(existing.prompt ?? '');
    }

    const updated = await (this.prisma as any).agentPrompt.update({ where: { id: pid }, data });
    return { data: updated, previewPrompt };
  }

  @Delete('users/:id/prompts/:promptId')
  async deleteUserPrompt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('promptId') promptId: string) {
    await assertSuperAdmin(this.prisma, user.userId);
    const targetUserId = String(id ?? '').trim();
    const pid = String(promptId ?? '').trim();
    if (!targetUserId) throw new BadRequestException('userId inválido');
    if (!pid) return { ok: true };
    return await this.agentPromptService.deletePrompt(targetUserId, pid);
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
      categoryId: string;
      agentName: string;
      prompt: string;
      active?: boolean;
    }
  ) {
    await assertSuperAdmin(this.prisma, user.userId);
    const targetUserId = String(body?.targetUserId ?? '').trim();
    const categoryId = String(body?.categoryId ?? '').trim();
    const agentName = String(body?.agentName ?? '').trim();
    const prompt = String(body?.prompt ?? '').trim();
    if (!targetUserId) throw new BadRequestException('targetUserId é obrigatório');
    if (!categoryId) throw new BadRequestException('categoryId é obrigatório');
    if (!agentName) throw new BadRequestException('agentName é obrigatório');
    if (!prompt) throw new BadRequestException('prompt é obrigatório');

    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!targetUser?.id) throw new NotFoundException('Usuário destinatário não encontrado');
    const category = await (this.prisma as any).promptCategory.findFirst({ where: { id: categoryId, active: true }, select: { id: true } });
    if (!category?.id) throw new BadRequestException('Categoria inválida');

    let created: any;
    try {
      created = await (this.prisma as any).agentPrompt.create({
        data: {
          userId: targetUserId,
          promptCategoryId: category.id,
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
      categoryId?: string;
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
    if (body?.categoryId !== undefined) {
      const categoryId = String(body.categoryId ?? '').trim();
      if (!categoryId) throw new BadRequestException('categoryId inválido');
      const category = await (this.prisma as any).promptCategory.findFirst({ where: { id: categoryId, active: true }, select: { id: true } });
      if (!category?.id) throw new BadRequestException('Categoria inválida');
      data.promptCategoryId = category.id;
    }
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

  @Get('prompt-categories')
  async listPromptCategories(@CurrentUser() user: AuthenticatedUser) {
    await assertSuperAdmin(this.prisma, user.userId);
    const rows = await (this.prisma as any).promptCategory.findMany({
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        basePrompt: true,
        adminRules: true,
        tools: true,
        requiredVariables: true,
        variables: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return { data: rows };
  }

  @Post('prompt-categories')
  async createPromptCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      name: string;
      description?: string | null;
      active?: boolean;
      basePrompt?: string | null;
      adminRules?: string | null;
      tools?: any;
      requiredVariables?: any;
      variables?: any;
    }
  ) {
    await assertSuperAdmin(this.prisma, user.userId);
    const name = String(body?.name ?? '').trim();
    if (!name) throw new BadRequestException('name é obrigatório');
    const created = await (this.prisma as any).promptCategory.create({
      data: {
        name,
        description: normalizeText(body?.description) ?? null,
        active: body?.active !== undefined ? Boolean(body.active) : true,
        basePrompt: String(body?.basePrompt ?? '').toString(),
        adminRules: normalizeText(body?.adminRules) ?? null,
        tools: body?.tools ?? null,
        requiredVariables: body?.requiredVariables ?? null,
        variables: body?.variables ?? null,
        createdByUserId: user.userId
      }
    });
    return { data: created };
  }

  @Put('prompt-categories/:id')
  async updatePromptCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      active?: boolean;
      basePrompt?: string | null;
      adminRules?: string | null;
      tools?: any;
      requiredVariables?: any;
      variables?: any;
    }
  ) {
    await assertSuperAdmin(this.prisma, user.userId);
    const categoryId = String(id ?? '').trim();
    if (!categoryId) throw new NotFoundException('Categoria não encontrada');
    const existing = await (this.prisma as any).promptCategory.findFirst({ where: { id: categoryId }, select: { id: true } });
    if (!existing?.id) throw new NotFoundException('Categoria não encontrada');
    const data: any = {};
    if (body?.name !== undefined) {
      const name = String(body.name ?? '').trim();
      if (!name) throw new BadRequestException('name inválido');
      data.name = name;
    }
    if (body?.description !== undefined) data.description = normalizeText(body.description) ?? null;
    if (body?.active !== undefined) data.active = Boolean(body.active);
    if (body?.basePrompt !== undefined) data.basePrompt = String(body.basePrompt ?? '');
    if (body?.adminRules !== undefined) data.adminRules = normalizeText(body.adminRules) ?? null;
    if (body?.tools !== undefined) data.tools = body.tools;
    if (body?.requiredVariables !== undefined) data.requiredVariables = body.requiredVariables;
    if (body?.variables !== undefined) data.variables = body.variables;
    const updated = await (this.prisma as any).promptCategory.update({ where: { id: categoryId }, data });
    return { data: updated };
  }

  @Delete('prompt-categories/:id')
  async deletePromptCategory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await assertSuperAdmin(this.prisma, user.userId);
    const categoryId = String(id ?? '').trim();
    if (!categoryId) return { ok: true };
    await (this.prisma as any).promptCategory.updateMany({ where: { id: categoryId }, data: { active: false } });
    return { ok: true };
  }

  @Get('agent-prompts/admin-created')
  async listAdminCreatedPrompts(@CurrentUser() user: AuthenticatedUser, @Query('userId') userId?: string) {
    await assertSuperAdmin(this.prisma, user.userId);
    const targetUserId = String(userId ?? '').trim();
    const rows = await (this.prisma as any).agentPrompt.findMany({
      where: {
        ...(targetUserId ? { userId: targetUserId } : {}),
        createdByUserId: { not: null }
      },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, role: true, email: true, name: true } },
        promptCategory: { select: { id: true, name: true, basePrompt: true, variables: true, tools: true, requiredVariables: true, adminRules: true } }
      }
    });
    const filtered = rows.filter((r: any) => isSuperAdminRole(r?.createdBy?.role));
    const data = filtered.map((r: any) => {
      const cfg = r.manualConfig && typeof r.manualConfig === 'object' ? (r.manualConfig as any) : null;
      const userCfg = cfg?.user && typeof cfg.user === 'object' ? cfg.user : {};
      const previewPrompt =
        r.promptType === 'USER_MANUAL' && r.promptCategory?.id
          ? (() => {
              const cfg = r.manualConfig && typeof r.manualConfig === 'object' ? (r.manualConfig as any) : null;
              if (cfg?.version === 3) return r.prompt;
              return renderN8nFinalPrompt({
                categoryName: r.promptCategory?.name,
                clientName: String(r.name ?? '').trim() || 'Agente',
                companyCorePrompt: r.promptCategory?.basePrompt ?? '',
                clientPrompt: String(r.prompt ?? '')
              });
            })()
          : r.prompt;
      return {
        id: r.id,
        user: r.user,
        createdBy: r.createdBy,
        category: r.promptCategory ? { id: r.promptCategory.id, name: r.promptCategory.name } : null,
        promptType: r.promptType,
        name: r.name,
        active: r.active,
        version: r.version,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        previewPrompt
      };
    });
    return { data };
  }

  @Post('manual-prompts')
  async createManualPrompt(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      targetUserId: string;
      categoryId: string;
      agentName: string;
      active?: boolean;
      userConfig?: any;
    }
  ) {
    await assertSuperAdmin(this.prisma, user.userId);
    const targetUserId = String(body?.targetUserId ?? '').trim();
    const categoryId = String(body?.categoryId ?? '').trim();
    const agentName = String(body?.agentName ?? '').trim();
    if (!targetUserId) throw new BadRequestException('targetUserId é obrigatório');
    if (!categoryId) throw new BadRequestException('categoryId é obrigatório');
    if (!agentName) throw new BadRequestException('agentName é obrigatório');

    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!targetUser?.id) throw new NotFoundException('Usuário destinatário não encontrado');

    const category = await (this.prisma as any).promptCategory.findFirst({
      where: { id: categoryId, active: true },
      select: { id: true, name: true, basePrompt: true, tools: true, requiredVariables: true, variables: true }
    });
    if (!category?.id) throw new NotFoundException('Categoria não encontrada');

    const userCfgRaw = body?.userConfig && typeof body.userConfig === 'object' ? body.userConfig : {};
    const userCfg = normalizeUserConfig(userCfgRaw);
    const manualConfig = { version: 4, categoryId: category.id, user: userCfg };
    const clientPrompt = buildClientBusinessBlock(agentName, userCfg);
    const prompt = clientPrompt;
    const previewPrompt = renderN8nFinalPrompt({
      categoryName: category.name,
      clientName: agentName,
      companyCorePrompt: category.basePrompt ?? '',
      clientPrompt
    });

    const created = await (this.prisma as any).agentPrompt.create({
      data: {
        userId: targetUserId,
        promptCategoryId: category.id,
        name: agentName,
        prompt,
        active: body?.active !== undefined ? Boolean(body.active) : true,
        promptType: 'USER_MANUAL',
        createdByUserId: user.userId,
        manualConfig,
        version: 1
      },
      select: { id: true, userId: true, promptCategoryId: true, name: true, active: true, promptType: true, version: true, createdAt: true, updatedAt: true }
    });

    return { data: created, previewPrompt };
  }

  @Put('manual-prompts/:id')
  async updateManualPrompt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body()
    body: {
      categoryId?: string;
      agentName?: string;
      active?: boolean;
      userConfig?: any;
    }
  ) {
    await assertSuperAdmin(this.prisma, user.userId);
    const promptId = String(id ?? '').trim();
    if (!promptId) throw new NotFoundException('Prompt não encontrado');
    const existing = await (this.prisma as any).agentPrompt.findFirst({
      where: { id: promptId, promptType: 'USER_MANUAL' }
    });
    if (!existing) throw new NotFoundException('Prompt não encontrado');

    const nextName = body?.agentName !== undefined ? String(body.agentName ?? '').trim() : String(existing.name ?? '').trim();
    if (!nextName) throw new BadRequestException('agentName inválido');

    const prevCfg = existing.manualConfig && typeof existing.manualConfig === 'object' ? (existing.manualConfig as any) : {};
    const prevCategoryId = String(prevCfg?.categoryId ?? existing.promptCategoryId ?? '').trim();
    const categoryId = String(body?.categoryId ?? prevCategoryId ?? '').trim();
    if (!categoryId) throw new BadRequestException('categoryId é obrigatório');

    const category = await (this.prisma as any).promptCategory.findFirst({
      where: { id: categoryId, active: true },
      select: { id: true, name: true, basePrompt: true, tools: true, requiredVariables: true, variables: true }
    });
    if (!category?.id) throw new NotFoundException('Categoria não encontrada');

    const prevUser = prevCfg?.user && typeof prevCfg.user === 'object' ? prevCfg.user : {};
    const userCfgRaw = body?.userConfig && typeof body.userConfig === 'object' ? body.userConfig : {};
    const userCfg = normalizeUserConfig({ ...prevUser, ...userCfgRaw });
    const manualConfig = { version: 4, categoryId: category.id, user: userCfg };
    const clientPrompt = buildClientBusinessBlock(nextName, userCfg);
    const prompt = clientPrompt;
    const previewPrompt = renderN8nFinalPrompt({
      categoryName: category.name,
      clientName: nextName,
      companyCorePrompt: category.basePrompt ?? '',
      clientPrompt
    });

    const updated = await (this.prisma as any).agentPrompt.update({
      where: { id: promptId },
      data: {
        name: nextName,
        promptCategoryId: category.id,
        ...(body?.active !== undefined ? { active: Boolean(body.active) } : {}),
        manualConfig,
        prompt,
        version: { increment: 1 }
      },
      select: { id: true, userId: true, promptCategoryId: true, name: true, active: true, promptType: true, version: true, createdAt: true, updatedAt: true }
    });

    return { data: updated, previewPrompt };
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
