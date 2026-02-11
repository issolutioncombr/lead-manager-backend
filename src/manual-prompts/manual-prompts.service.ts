import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ManualPromptConfig = {
  strategy?: string;
  language?: string;
  businessRules?: string;
  serviceParameters?: string;
  faqs?: Array<{ question: string; answer: string }>;
  variables?: Record<string, any>;
  flowVariables?: {
    problema_capilar: string;
    tempo_tentativas: string;
    periodo: string;
    dia_confirmado: string;
    inicio: string;
    fim: string;
    nome_completo: string;
    email: string;
  };
  scheduling?: {
    timezone?: string;
    windowStart?: string;
    windowEnd?: string;
    minLeadTimeMinutes?: string;
  };
};

const normalizeText = (value?: string | null) => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

const normalizeConfig = (input: any): ManualPromptConfig => {
  const faqs = Array.isArray(input?.faqs)
    ? input.faqs
        .map((f: any) => ({
          question: normalizeText(f?.question),
          answer: normalizeText(f?.answer)
        }))
        .filter((f: any) => f.question && f.answer)
    : [];

  const scheduling = input?.scheduling
    ? {
        timezone: normalizeText(input.scheduling.timezone),
        windowStart: normalizeText(input.scheduling.windowStart),
        windowEnd: normalizeText(input.scheduling.windowEnd),
        minLeadTimeMinutes: normalizeText(input.scheduling.minLeadTimeMinutes)
      }
    : undefined;

  const flow = input?.flowVariables && typeof input.flowVariables === 'object' ? input.flowVariables : {};
  const flowVariables = {
    problema_capilar: String(flow?.problema_capilar ?? '').trim(),
    tempo_tentativas: String(flow?.tempo_tentativas ?? '').trim(),
    periodo: String(flow?.periodo ?? '').trim(),
    dia_confirmado: String(flow?.dia_confirmado ?? '').trim(),
    inicio: String(flow?.inicio ?? '').trim(),
    fim: String(flow?.fim ?? '').trim(),
    nome_completo: String(flow?.nome_completo ?? '').trim(),
    email: String(flow?.email ?? '').trim()
  };

  return {
    strategy: normalizeText(input?.strategy),
    language: normalizeText(input?.language),
    businessRules: normalizeText(input?.businessRules),
    serviceParameters: normalizeText(input?.serviceParameters),
    faqs: faqs.length ? faqs : undefined,
    variables: input?.variables && typeof input.variables === 'object' ? input.variables : undefined,
    flowVariables,
    scheduling
  };
};

const buildManualPrompt = (agentName: string, config: ManualPromptConfig) => {
  const blocks: string[] = [];
  blocks.push(`# Perfil do agente`);
  blocks.push(`Agente: ${agentName}`);

  if (config.flowVariables) {
    blocks.push(``);
    blocks.push(`# Variáveis do fluxo (preenchidas)`);
    blocks.push(`- problema_capilar: ${config.flowVariables.problema_capilar}`);
    blocks.push(`- tempo_tentativas: ${config.flowVariables.tempo_tentativas}`);
    blocks.push(`- periodo: ${config.flowVariables.periodo}`);
    blocks.push(`- dia_confirmado: ${config.flowVariables.dia_confirmado}`);
    blocks.push(`- inicio: ${config.flowVariables.inicio}`);
    blocks.push(`- fim: ${config.flowVariables.fim}`);
    blocks.push(`- nome_completo: ${config.flowVariables.nome_completo}`);
    blocks.push(`- email: ${config.flowVariables.email}`);
  }

  if (config.language) {
    blocks.push(``);
    blocks.push(`# Linguagem`);
    blocks.push(config.language);
  }

  if (config.strategy) {
    blocks.push(``);
    blocks.push(`# Estratégia`);
    blocks.push(config.strategy);
  }

  if (config.businessRules) {
    blocks.push(``);
    blocks.push(`# Regras comerciais`);
    blocks.push(config.businessRules);
  }

  if (config.serviceParameters) {
    blocks.push(``);
    blocks.push(`# Parâmetros de atendimento`);
    blocks.push(config.serviceParameters);
  }

  if (config.scheduling && (config.scheduling.timezone || config.scheduling.windowStart || config.scheduling.windowEnd || config.scheduling.minLeadTimeMinutes)) {
    blocks.push(``);
    blocks.push(`# Configurações de agendamento`);
    if (config.scheduling.timezone) blocks.push(`- Timezone: ${config.scheduling.timezone}`);
    if (config.scheduling.windowStart) blocks.push(`- Janela início: ${config.scheduling.windowStart}`);
    if (config.scheduling.windowEnd) blocks.push(`- Janela fim: ${config.scheduling.windowEnd}`);
    if (config.scheduling.minLeadTimeMinutes) blocks.push(`- Antecedência mínima (min): ${config.scheduling.minLeadTimeMinutes}`);
  }

  if (Array.isArray(config.faqs) && config.faqs.length) {
    blocks.push(``);
    blocks.push(`# FAQ`);
    config.faqs.forEach((f, idx) => {
      blocks.push(``);
      blocks.push(`## ${idx + 1}. ${f.question}`);
      blocks.push(f.answer);
    });
  }

  if (config.variables && Object.keys(config.variables).length) {
    blocks.push(``);
    blocks.push(`# Variáveis específicas`);
    blocks.push(JSON.stringify(config.variables, null, 2));
  }

  blocks.push(``);
  blocks.push(`---`);
  blocks.push(`Este conteúdo é gerado a partir do formulário do sistema e não deve conter regras técnicas internas, ferramentas ou lógica estrutural do fluxo.`);
  blocks.push(``);

  return blocks.join('\n');
};

@Injectable()
export class ManualPromptsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return (this.prisma as any).agentPrompt.findMany({
      where: { userId, promptType: 'USER_MANUAL' },
      orderBy: [{ updatedAt: 'desc' }],
      select: { id: true, name: true, active: true, promptType: true, version: true, createdAt: true, updatedAt: true, manualConfig: true }
    });
  }

  async get(userId: string, id: string) {
    const promptId = String(id ?? '').trim();
    if (!promptId) throw new NotFoundException('Prompt não encontrado');
    const row = await (this.prisma as any).agentPrompt.findFirst({
      where: { id: promptId, userId, promptType: 'USER_MANUAL' }
    });
    if (!row) throw new NotFoundException('Prompt não encontrado');
    return {
      id: row.id,
      agentName: row.name,
      active: row.active,
      version: row.version,
      config: row.manualConfig ?? {}
    };
  }

  async create(userId: string, input: any) {
    const agentName = normalizeText(input?.agentName);
    if (!agentName) throw new BadRequestException('agentName é obrigatório');
    const config = normalizeConfig(input);
    const fv = config.flowVariables;
    const missing = fv
      ? Object.entries(fv)
          .filter(([, v]) => !String(v ?? '').trim())
          .map(([k]) => k)
      : ['flowVariables'];
    if (missing.length) {
      throw new BadRequestException(`flowVariables incompleto: ${missing.join(', ')}`);
    }
    const prompt = buildManualPrompt(agentName, config);
    return (this.prisma as any).agentPrompt.create({
      data: {
        userId,
        name: agentName,
        prompt,
        active: input?.active !== undefined ? Boolean(input.active) : true,
        promptType: 'USER_MANUAL',
        createdByUserId: userId,
        manualConfig: config,
        version: 1
      },
      select: { id: true, name: true, active: true, promptType: true, version: true, createdAt: true, updatedAt: true }
    });
  }

  async update(userId: string, id: string, input: any) {
    const promptId = String(id ?? '').trim();
    if (!promptId) throw new NotFoundException('Prompt não encontrado');
    const existing = await (this.prisma as any).agentPrompt.findFirst({
      where: { id: promptId, userId, promptType: 'USER_MANUAL' }
    });
    if (!existing) throw new NotFoundException('Prompt não encontrado');

    const nextName = input?.agentName !== undefined ? normalizeText(input.agentName) : normalizeText(existing.name);
    if (!nextName) throw new BadRequestException('agentName é obrigatório');
    const config = normalizeConfig({ ...existing.manualConfig, ...input, flowVariables: input?.flowVariables ?? existing.manualConfig?.flowVariables });
    const fv = config.flowVariables;
    const missing = fv
      ? Object.entries(fv)
          .filter(([, v]) => !String(v ?? '').trim())
          .map(([k]) => k)
      : ['flowVariables'];
    if (missing.length) {
      throw new BadRequestException(`flowVariables incompleto: ${missing.join(', ')}`);
    }
    const prompt = buildManualPrompt(nextName, config);

    return (this.prisma as any).agentPrompt.update({
      where: { id: promptId },
      data: {
        name: nextName,
        ...(input?.active !== undefined ? { active: Boolean(input.active) } : {}),
        manualConfig: config,
        prompt,
        version: { increment: 1 }
      },
      select: { id: true, name: true, active: true, promptType: true, version: true, createdAt: true, updatedAt: true }
    });
  }
}
