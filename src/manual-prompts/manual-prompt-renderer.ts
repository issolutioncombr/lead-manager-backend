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

export const buildUserContextBlock = (agentName: string, config: ManualPromptUserConfig) => {
  const blocks: string[] = [];
  blocks.push(`# Contexto do negócio (definido no sistema)`);
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
  blocks.push(`Este conteúdo é gerado a partir do formulário do sistema e não deve conter regras técnicas internas, ferramentas ou lógica estrutural do fluxo.`);
  blocks.push(``);

  return blocks.join('\n');
};

const formatAdminBlock = (category: {
  adminRules?: string | null;
  tools?: any;
  requiredVariables?: any;
  variables?: any;
}) => {
  const blocks: string[] = [];
  const rules = normalizeText(category?.adminRules ?? null);
  const tools = Array.isArray(category?.tools) ? category.tools.map((t: any) => String(t)) : [];
  const requiredVariables = Array.isArray(category?.requiredVariables) ? category.requiredVariables.map((v: any) => String(v)) : [];
  const variables = category?.variables && typeof category.variables === 'object' ? category.variables : null;

  if (rules) {
    blocks.push(`# Regras do Admin`);
    blocks.push(rules);
  }
  if (tools.length) {
    blocks.push(`# Ferramentas`);
    tools.forEach((t) => blocks.push(`- ${t}`));
  }
  if (requiredVariables.length) {
    blocks.push(`# Variáveis obrigatórias`);
    requiredVariables.forEach((v) => blocks.push(`- {${v}}`));
  }
  if (variables && Object.keys(variables).length) {
    blocks.push(`# Variáveis do sistema (Admin)`);
    blocks.push(JSON.stringify(variables, null, 2));
  }
  return blocks.join('\n\n');
};

export const renderPromptFromCategoryBase = (agentName: string, categoryBasePrompt: string, userConfig: ManualPromptUserConfig) => {
  const base = String(categoryBasePrompt ?? '').trim();
  const userContext = buildUserContextBlock(agentName, userConfig ?? {});
  if (!base) return userContext;
  const withName = base.split('{{AGENT_NAME}}').join(agentName);
  if (withName.includes('{{USER_CONTEXT}}')) {
    return withName.split('{{USER_CONTEXT}}').join(userContext);
  }
  return `${userContext}\n\n${withName}`;
};

export const renderPromptFromCategory = (
  agentName: string,
  category: { basePrompt?: string | null; adminRules?: string | null; tools?: any; requiredVariables?: any; variables?: any },
  userConfig: ManualPromptUserConfig
) => {
  const base = String(category?.basePrompt ?? '').trim();
  const adminBlock = formatAdminBlock(category);
  const userContext = buildUserContextBlock(agentName, userConfig ?? {});

  if (!base) {
    return adminBlock ? `${userContext}\n\n${adminBlock}` : userContext;
  }

  let rendered = base.split('{{AGENT_NAME}}').join(agentName).split('{{USER_CONTEXT}}').join(userContext);
  if (rendered.includes('{{ADMIN_BLOCK}}')) {
    rendered = rendered.split('{{ADMIN_BLOCK}}').join(adminBlock || '');
  } else if (adminBlock) {
    rendered = `${rendered}\n\n${adminBlock}`;
  }
  return rendered;
};
