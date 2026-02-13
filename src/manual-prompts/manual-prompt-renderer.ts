export type ManualPromptUserConfig = {
  strategy?: string;
  language?: string;
  businessRules?: string;
  serviceParameters?: string;
  faqs?: Array<{ question: string; answer: string }>;
};

const normalizeText = (value?: string | null) => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

export const normalizeUserConfig = (input: any): ManualPromptUserConfig => {
  const faqs = Array.isArray(input?.faqs)
    ? input.faqs
        .map((f: any) => ({
          question: normalizeText(f?.question),
          answer: normalizeText(f?.answer)
        }))
        .filter((f: any) => f.question && f.answer)
    : [];

  return {
    strategy: normalizeText(input?.strategy),
    language: normalizeText(input?.language),
    businessRules: normalizeText(input?.businessRules),
    serviceParameters: normalizeText(input?.serviceParameters),
    faqs: faqs.length ? faqs : undefined
  };
};

export const buildClientBusinessBlock = (agentName: string, config: ManualPromptUserConfig) => {
  const blocks: string[] = [];
  blocks.push(`# SDR • CLIENTE — Negócio (definido no sistema)`);
  blocks.push(`Agente: ${agentName}`);
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

  if (Array.isArray(config.faqs) && config.faqs.length) {
    blocks.push(``);
    blocks.push(`# FAQ`);
    config.faqs.forEach((f, idx) => {
      blocks.push(``);
      blocks.push(`## ${idx + 1}. ${f.question}`);
      blocks.push(f.answer);
    });
  }

  blocks.push(``);
  blocks.push(`---`);
  blocks.push(`Este conteúdo é gerado a partir do formulário do sistema e deve conter apenas regras do cliente/negócio.`);
  blocks.push(``);

  return blocks.join('\n');
};

export const renderN8nFinalPrompt = (input: {
  categoryName?: string | null;
  clientName?: string | null;
  companyCorePrompt: string;
  clientPrompt: string;
}) => {
  const categoryName = String(input.categoryName ?? '').trim();
  const clientName = String(input.clientName ?? '').trim();
  const companyCorePrompt = String(input.companyCorePrompt ?? '').trim();
  const clientPrompt = String(input.clientPrompt ?? '').trim();

  const blocks: string[] = [];
  blocks.push(`# SDR (N8N) — FINAL GERADO`);
  blocks.push(``);
  blocks.push(`INSTRUÇÃO DE USO`);
  blocks.push(`- No n8n, cole todo o conteúdo abaixo no System Message.`);
  blocks.push(`- Este “final” é a concatenação do prompt da empresa + prompt do cliente, mantendo a separação por blocos.`);
  blocks.push(``);
  blocks.push(`========================`);
  blocks.push(`BLOCO 1 — EMPRESA (CORE${categoryName ? ` • ${categoryName}` : ''})`);
  blocks.push(`========================`);
  blocks.push(``);
  blocks.push(companyCorePrompt);
  blocks.push(``);
  blocks.push(`========================`);
  blocks.push(`BLOCO 2 — CLIENTE${clientName ? ` (${clientName})` : ''}`);
  blocks.push(`========================`);
  blocks.push(``);
  blocks.push(clientPrompt);
  blocks.push(``);
  return blocks.join('\n');
};
