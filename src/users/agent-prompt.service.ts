import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isSuperAdminRole } from '../common/super-admin';

@Injectable()
export class AgentPromptService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly maxStoredPromptLength = 100000;

  private normalizePromptName(name: string | null | undefined): string | null {
    const normalized = (name ?? '').trim();
    return normalized ? normalized : null;
  }

  private async assertUniquePromptName(userId: string, name: string | null, excludeId?: string) {
    if (!name) return;
    const rows = await (this.prisma as any).agentPrompt.findMany({
      where: { userId, name: { not: null } },
      select: { id: true, name: true }
    });
    const target = name.toLowerCase();
    const dup = rows.find((r: any) => {
      if (!r?.name) return false;
      if (excludeId && r.id === excludeId) return false;
      return String(r.name).toLowerCase() === target;
    });
    if (dup?.id) throw new BadRequestException('Já existe um prompt com esse nome');
  }

  async getLegacyPrompt(userId: string): Promise<string> {
    const record = await (this.prisma as any).legacyAgentPrompt.findUnique({
      where: { userId }
    });
    return record?.prompt ?? '';
  }

  async updateLegacyPrompt(userId: string, prompt?: string | null): Promise<string> {
    const normalized = prompt ?? '';

    const record = await (this.prisma as any).legacyAgentPrompt.upsert({
      where: { userId },
      update: { prompt: normalized },
      create: {
        userId,
        prompt: normalized
      }
    });

    return record.prompt ?? '';
  }

  async getLegacyPromptForInstance(userId: string, instanceId: string): Promise<string> {
    const instanceKey = (instanceId ?? '').trim();
    if (!instanceKey) return '';
    const record = await (this.prisma as any).evolutionInstance.findFirst({
      where: { userId, OR: [{ instanceId: instanceKey }, { providerInstanceId: instanceKey }] },
      select: { agentPrompt: true }
    });
    return record?.agentPrompt ?? '';
  }

  async updateLegacyPromptForInstance(userId: string, instanceId: string, prompt?: string | null): Promise<string> {
    const instanceKey = (instanceId ?? '').trim();
    if (!instanceKey) {
      throw new NotFoundException('Instância inválida');
    }
    const normalized = prompt ?? '';
    const instance = await (this.prisma as any).evolutionInstance.findFirst({
      where: { userId, OR: [{ instanceId: instanceKey }, { providerInstanceId: instanceKey }] },
      select: { id: true }
    });
    if (!instance?.id) {
      throw new NotFoundException('Instância não encontrada');
    }
    await (this.prisma as any).evolutionInstance.update({
      where: { id: instance.id },
      data: { agentPrompt: normalized }
    });
    return normalized;
  }

  private async isRequesterSuperAdmin(requesterUserId: string) {
    const model = (this.prisma as any).user;
    if (!model || typeof model.findUnique !== 'function') return false;
    const user = await model.findUnique({ where: { id: requesterUserId }, select: { role: true } });
    return isSuperAdminRole(user?.role);
  }

  async listPrompts(requesterUserId: string) {
    const isSuperAdmin = await this.isRequesterSuperAdmin(requesterUserId);
    const rows = await (this.prisma as any).agentPrompt.findMany({
      where: { userId: requesterUserId },
      orderBy: [{ updatedAt: 'desc' }]
    });
    if (isSuperAdmin) return rows;
    return rows.map((r: any) => ({ ...r, prompt: null }));
  }

  async createPrompt(userId: string, data: { categoryId: string; name?: string | null; prompt: string }) {
    const prompt = (data.prompt ?? '').trim();
    if (!prompt) throw new BadRequestException('Prompt é obrigatório');
    if (prompt.length > this.maxStoredPromptLength) throw new BadRequestException('Prompt muito grande');
    const name = this.normalizePromptName(data.name);
    await this.assertUniquePromptName(userId, name);
    const categoryId = String(data.categoryId ?? '').trim();
    if (!categoryId) throw new BadRequestException('categoryId é obrigatório');
    const category = await (this.prisma as any).promptCategory.findFirst({ where: { id: categoryId, active: true }, select: { id: true } });
    if (!category?.id) throw new BadRequestException('Categoria inválida');
    return await (this.prisma as any).agentPrompt.create({
      data: {
        userId,
        promptCategoryId: category.id,
        name,
        prompt,
        active: true,
        promptType: 'USER_RAW',
        createdByUserId: userId,
        version: 1
      }
    });
  }

  async updatePrompt(userId: string, promptId: string, data: { categoryId?: string; name?: string | null; prompt?: string | null; active?: boolean }) {
    const id = (promptId ?? '').trim();
    if (!id) throw new NotFoundException('Prompt não encontrado');
    const existing = await (this.prisma as any).agentPrompt.findFirst({
      where: { id, userId },
      select: { id: true, promptType: true }
    });
    if (!existing?.id) throw new NotFoundException('Prompt não encontrado');
    const update: any = {};
    if (data.categoryId !== undefined) {
      const categoryId = String(data.categoryId ?? '').trim();
      if (!categoryId) throw new BadRequestException('categoryId inválido');
      const category = await (this.prisma as any).promptCategory.findFirst({ where: { id: categoryId, active: true }, select: { id: true } });
      if (!category?.id) throw new BadRequestException('Categoria inválida');
      update.promptCategoryId = category.id;
    }
    if (data.name !== undefined) {
      const nextName = this.normalizePromptName(data.name);
      await this.assertUniquePromptName(userId, nextName, id);
      update.name = nextName;
    }
    if (data.prompt !== undefined) {
      const p = (data.prompt ?? '').trim();
      if (!p) throw new BadRequestException('Prompt é obrigatório');
      if (p.length > this.maxStoredPromptLength) throw new BadRequestException('Prompt muito grande');
      update.prompt = p;
    }
    if (data.active !== undefined) update.active = !!data.active;
    update.version = { increment: 1 };
    return await (this.prisma as any).agentPrompt.update({ where: { id }, data: update });
  }

  private normalizeTo10000Bps(items: Array<{ id: string; bps: number }>): Map<string, number> {
    if (items.length === 1) return new Map([[items[0].id, 10000]]);
    const total = items.reduce((acc, it) => acc + (Number(it.bps) || 0), 0);
    if (total <= 0) {
      const base = Math.floor(10000 / items.length);
      const rem = 10000 - base * items.length;
      const m = new Map<string, number>();
      for (let i = 0; i < items.length; i += 1) m.set(items[i].id, base + (i < rem ? 1 : 0));
      return m;
    }
    const scaled = items.map((it) => {
      const raw = (it.bps * 10000) / total;
      const floor = Math.floor(raw);
      return { id: it.id, floor, frac: raw - floor };
    });
    const sumFloor = scaled.reduce((acc, it) => acc + it.floor, 0);
    let rem = 10000 - sumFloor;
    scaled.sort((a, b) => b.frac - a.frac);
    const out = new Map<string, number>();
    for (const it of scaled) {
      const add = rem > 0 ? 1 : 0;
      if (rem > 0) rem -= 1;
      out.set(it.id, it.floor + add);
    }
    return out;
  }

  async deletePrompt(userId: string, promptId: string) {
    const id = (promptId ?? '').trim();
    if (!id) throw new NotFoundException('Prompt não encontrado');
    const existing = await (this.prisma as any).agentPrompt.findFirst({
      where: { id, userId },
      select: { id: true, promptType: true }
    });
    if (!existing?.id) throw new NotFoundException('Prompt não encontrado');
    await this.prisma.$transaction(async (tx) => {
      const affected = await (tx as any).evolutionInstanceAgentPrompt.findMany({
        where: { userId, agentPromptId: id },
        select: { evolutionInstanceId: true }
      });
      const instanceIds = Array.from(new Set(affected.map((a: any) => a.evolutionInstanceId).filter(Boolean)));

      for (const evolutionInstanceId of instanceIds) {
        const remaining = await (tx as any).evolutionInstanceAgentPrompt.findMany({
          where: { userId, evolutionInstanceId, agentPromptId: { not: id } },
          select: { id: true, agentPromptId: true, percentBps: true, active: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }]
        });
        if (!remaining.length) continue;

        let remainingActive = remaining.filter((l: any) => l.active !== false);
        let forcedActiveId: string | null = null;
        if (!remainingActive.length) {
          forcedActiveId = remaining[0].id;
          remainingActive = [{ ...remaining[0], active: true }];
        }

        const normalizedMap = this.normalizeTo10000Bps(
          remainingActive.map((l: any) => ({ id: l.id, bps: Number(l.percentBps ?? 0) || 0 }))
        );

        let replacementPromptId: string | null = null;
        let replacementBps = -1;
        for (const l of remaining) {
          const isActive = forcedActiveId ? l.id === forcedActiveId : l.active !== false;
          const bps = isActive ? normalizedMap.get(l.id) ?? 0 : 0;
          await (tx as any).evolutionInstanceAgentPrompt.update({
            where: { id: l.id },
            data: forcedActiveId && l.id === forcedActiveId ? { percentBps: bps, active: true } : { percentBps: bps }
          });
          if (isActive && bps >= replacementBps) {
            replacementBps = bps;
            replacementPromptId = l.agentPromptId;
          }
        }

        if (replacementPromptId) {
          await (tx as any).evolutionInstancePromptAssignment.updateMany({
            where: { userId, evolutionInstanceId, agentPromptId: id },
            data: { agentPromptId: replacementPromptId, assignedBy: 'system' }
          });
        }
      }

      await (tx as any).agentPrompt.delete({ where: { id } });
    });
    return { ok: true };
  }

  private async resolveEvolutionInstanceByKey(userId: string, instanceKey: string) {
    const key = (instanceKey ?? '').trim();
    if (!key) throw new NotFoundException('Instância inválida');
    const inst = await (this.prisma as any).evolutionInstance.findFirst({
      where: { userId, OR: [{ instanceId: key }, { providerInstanceId: key }] },
      select: { id: true, instanceId: true, providerInstanceId: true }
    });
    if (!inst?.id) throw new NotFoundException('Instância não encontrada');
    return inst;
  }

  async listInstancePromptLinks(userId: string, instanceKey: string) {
    const isSuperAdmin = await this.isRequesterSuperAdmin(userId);
    const inst = await this.resolveEvolutionInstanceByKey(userId, instanceKey);
    const links = await (this.prisma as any).evolutionInstanceAgentPrompt.findMany({
      where: { userId, evolutionInstanceId: inst.id },
      orderBy: [{ createdAt: 'asc' }],
      include: { agentPrompt: true }
    });
    return {
      instance: inst,
      links: links.map((l: any) => ({
        promptId: l.agentPromptId,
        percent: Number(l.percentBps ?? 0) / 100,
        active: l.active,
        prompt: {
          id: l.agentPrompt.id,
          name: l.agentPrompt.name,
          prompt: isSuperAdmin ? l.agentPrompt.prompt : null,
          active: l.agentPrompt.active,
          promptType: l.agentPrompt.promptType ?? 'USER_RAW',
          version: l.agentPrompt.version ?? 1,
          createdAt: l.agentPrompt.createdAt,
          updatedAt: l.agentPrompt.updatedAt
        }
      }))
    };
  }

  async setInstancePromptLinks(
    userId: string,
    instanceKey: string,
    items: Array<{ promptId: string; percent: number; active?: boolean }>
  ) {
    const inst = await this.resolveEvolutionInstanceByKey(userId, instanceKey);
    const normalized = (Array.isArray(items) ? items : []).map((it) => ({
      promptId: String(it.promptId ?? '').trim(),
      percentBps: Math.round(Number(it.percent) * 100),
      active: it.active !== undefined ? !!it.active : true
    }));

    for (const it of normalized) {
      if (!it.promptId) throw new BadRequestException('promptId é obrigatório');
      if (!Number.isFinite(it.percentBps)) throw new BadRequestException('percent inválido');
      if (it.percentBps < 0 || it.percentBps > 10000) throw new BadRequestException('percent deve estar entre 0 e 100');
    }
    const sum = normalized.reduce((acc, it) => acc + (it.active ? it.percentBps : 0), 0);
    if (normalized.length > 0 && sum !== 10000) {
      throw new BadRequestException('A soma dos percentuais ativos deve ser 100');
    }
    const ids = Array.from(new Set(normalized.map((i) => i.promptId)));
    const owned = await (this.prisma as any).agentPrompt.findMany({ where: { userId, id: { in: ids } }, select: { id: true } });
    const ownedSet = new Set(owned.map((p: any) => p.id));
    for (const id of ids) {
      if (!ownedSet.has(id)) throw new BadRequestException(`Prompt inválido: ${id}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).evolutionInstanceAgentPrompt.deleteMany({ where: { userId, evolutionInstanceId: inst.id } });
      if (normalized.length) {
        await (tx as any).evolutionInstanceAgentPrompt.createMany({
          data: normalized.map((it) => ({
            userId,
            evolutionInstanceId: inst.id,
            agentPromptId: it.promptId,
            percentBps: it.percentBps,
            active: it.active
          }))
        });
      }
    });

    return await this.listInstancePromptLinks(userId, instanceKey);
  }

  private normalizePhoneRaw(value: string): string {
    return (value ?? '').toString().replace(/\D+/g, '');
  }

  async getDestinationAssignment(userId: string, instanceKey: string, phoneRaw: string) {
    const inst = await this.resolveEvolutionInstanceByKey(userId, instanceKey);
    const phone = this.normalizePhoneRaw(phoneRaw);
    if (!phone) throw new BadRequestException('Destino inválido');
    const record = await (this.prisma as any).evolutionInstancePromptAssignment.findUnique({
      where: { evolutionInstanceId_phoneRaw: { evolutionInstanceId: inst.id, phoneRaw: phone } },
      include: { agentPrompt: true }
    });
    if (!record) return { instance: inst, phoneRaw: phone, assignment: null };
    return {
      instance: inst,
      phoneRaw: phone,
      assignment: {
        promptId: record.agentPromptId,
        name: record.agentPrompt?.name ?? null,
        assignedBy: record.assignedBy ?? 'auto',
        updatedAt: record.updatedAt
      }
    };
  }

  async setDestinationAssignment(userId: string, instanceKey: string, phoneRaw: string, promptId: string | null | undefined) {
    const inst = await this.resolveEvolutionInstanceByKey(userId, instanceKey);
    const phone = this.normalizePhoneRaw(phoneRaw);
    if (!phone) throw new BadRequestException('Destino inválido');
    const id = (promptId ?? '').trim();
    if (!id) {
      await (this.prisma as any).evolutionInstancePromptAssignment.deleteMany({
        where: { evolutionInstanceId: inst.id, phoneRaw: phone, userId }
      });
      return await this.getDestinationAssignment(userId, instanceKey, phone);
    }
    const link = await (this.prisma as any).evolutionInstanceAgentPrompt.findFirst({
      where: { userId, evolutionInstanceId: inst.id, agentPromptId: id, active: true, agentPrompt: { active: true } },
      select: { agentPromptId: true }
    });
    if (!link?.agentPromptId) throw new BadRequestException('Prompt não está vinculado à instância');
    await (this.prisma as any).evolutionInstancePromptAssignment.upsert({
      where: { evolutionInstanceId_phoneRaw: { evolutionInstanceId: inst.id, phoneRaw: phone } },
      update: { agentPromptId: id, assignedBy: 'manual' },
      create: { userId, evolutionInstanceId: inst.id, phoneRaw: phone, agentPromptId: id, assignedBy: 'manual' }
    });
    return await this.getDestinationAssignment(userId, instanceKey, phone);
  }

  private parseDateRange(from?: string, to?: string): { from: Date; to: Date } {
    const normalizeDate = (input: string | undefined, endOfDay: boolean) => {
      if (!input) return null;
      const raw = input.trim();
      if (!raw) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return endOfDay ? new Date(`${raw}T23:59:59.999Z`) : new Date(`${raw}T00:00:00.000Z`);
      }
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const now = new Date();
    const defaultTo = now;
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const parsedFrom = normalizeDate(from, false) ?? defaultFrom;
    const parsedTo = normalizeDate(to, true) ?? defaultTo;
    return { from: parsedFrom, to: parsedTo };
  }

  async getPromptDispatchReport(userId: string, params: { instanceId?: string; from?: string; to?: string; phoneRaw?: string }) {
    const { from, to } = this.parseDateRange(params.from, params.to);
    const phone = params.phoneRaw ? this.normalizePhoneRaw(params.phoneRaw) : null;
    const instanceKey = (params.instanceId ?? '').trim() || null;
    const instance = instanceKey ? await this.resolveEvolutionInstanceByKey(userId, instanceKey) : null;

    const rows: any[] = await (this.prisma as any).$queryRaw(
      Prisma.sql`
        SELECT
          "evolution_instance_id" as "evolutionInstanceId",
          "agent_prompt_id" as "agentPromptId",
          "prompt_name" as "promptName",
          "assigned_by" as "assignedBy",
          COUNT(*)::bigint as "events",
          COUNT(DISTINCT "phone_raw")::bigint as "destinations"
        FROM "agent_prompt_dispatch_logs"
        WHERE "userId" = ${userId}
          AND "occurred_at" >= ${from}
          AND "occurred_at" <= ${to}
          ${instance ? Prisma.sql`AND "evolution_instance_id" = ${instance.id}` : Prisma.empty}
          ${phone ? Prisma.sql`AND "phone_raw" = ${phone}` : Prisma.empty}
        GROUP BY "evolution_instance_id", "agent_prompt_id", "prompt_name", "assigned_by"
        ORDER BY "events" DESC
      `
    );

    const data = rows.map((r) => ({
      evolutionInstanceId: r.evolutionInstanceId as string,
      agentPromptId: (r.agentPromptId as string | null) ?? null,
      promptName: (r.promptName as string | null) ?? null,
      assignedBy: r.assignedBy as string,
      events: typeof r.events === 'bigint' ? Number(r.events) : Number(r.events ?? 0),
      destinations: typeof r.destinations === 'bigint' ? Number(r.destinations) : Number(r.destinations ?? 0)
    }));

    return {
      from,
      to,
      instance,
      phoneRaw: phone,
      data
    };
  }

  async getPromptDispatchDailyReport(userId: string, params: { instanceId?: string; from?: string; to?: string; phoneRaw?: string; assignedBy?: string }) {
    const { from, to } = this.parseDateRange(params.from, params.to);
    const phone = params.phoneRaw ? this.normalizePhoneRaw(params.phoneRaw) : null;
    const instanceKey = (params.instanceId ?? '').trim() || null;
    const instance = instanceKey ? await this.resolveEvolutionInstanceByKey(userId, instanceKey) : null;
    const assignedBy = (params.assignedBy ?? '').trim() || null;

    const rows: any[] = await (this.prisma as any).$queryRaw(
      Prisma.sql`
        SELECT
          to_char(date_trunc('day', "occurred_at"), 'YYYY-MM-DD') as "day",
          "evolution_instance_id" as "evolutionInstanceId",
          "agent_prompt_id" as "agentPromptId",
          "prompt_name" as "promptName",
          "assigned_by" as "assignedBy",
          COUNT(*)::bigint as "events",
          COUNT(DISTINCT "phone_raw")::bigint as "destinations"
        FROM "agent_prompt_dispatch_logs"
        WHERE "userId" = ${userId}
          AND "occurred_at" >= ${from}
          AND "occurred_at" <= ${to}
          ${instance ? Prisma.sql`AND "evolution_instance_id" = ${instance.id}` : Prisma.empty}
          ${phone ? Prisma.sql`AND "phone_raw" = ${phone}` : Prisma.empty}
          ${assignedBy ? Prisma.sql`AND "assigned_by" = ${assignedBy}` : Prisma.empty}
        GROUP BY "day", "evolution_instance_id", "agent_prompt_id", "prompt_name", "assigned_by"
        ORDER BY "day" ASC
      `
    );

    const data = rows.map((r) => ({
      day: r.day as string,
      evolutionInstanceId: r.evolutionInstanceId as string,
      agentPromptId: (r.agentPromptId as string | null) ?? null,
      promptName: (r.promptName as string | null) ?? null,
      assignedBy: r.assignedBy as string,
      events: typeof r.events === 'bigint' ? Number(r.events) : Number(r.events ?? 0),
      destinations: typeof r.destinations === 'bigint' ? Number(r.destinations) : Number(r.destinations ?? 0)
    }));

    return {
      from,
      to,
      instance,
      phoneRaw: phone,
      assignedBy,
      data
    };
  }
}
