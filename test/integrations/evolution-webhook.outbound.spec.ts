import { EvolutionWebhookService } from '../../src/integrations/evolution-webhook.service';

describe('EvolutionWebhookService outbound payload (messages.upsert)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, N8N_WEBHOOK_URL: 'https://example.com/webhook' } as any;
    (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200 }));
  });

  afterEach(() => {
    process.env = originalEnv;
    (global as any).fetch = undefined;
  });

  it('inclui user_id, company_id, company_name, instance_id e from_number', async () => {
    const prisma = {
      evolutionInstance: {
        findFirst: jest.fn(async () => ({
          id: 'evo-1',
          userId: 'user-123',
          instanceId: 'inst-abc',
          providerInstanceId: 'prov-xyz',
          metadata: {}
        }))
      },
      evolutionInstanceAgentPrompt: {
        findMany: jest.fn(async () => [])
      },
      lead: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      webhook: {
        create: jest.fn(async () => ({
          id: 'wh-1',
          userId: 'user-123',
          instanceId: 'inst-abc',
          providerInstanceId: 'prov-xyz'
        })),
        update: jest.fn(async () => ({}))
      },
      whatsappMessage: {
        upsert: jest.fn(async () => ({}))
      },
      user: {
        findUnique: jest.fn(async () => ({
          apiKey: 'apikey-1',
          companyName: 'ACME Ltd'
        }))
      }
    };
    const events = { emit: jest.fn() };
    const svc = new EvolutionWebhookService(prisma as any, events as any);

    await svc.handleWebhook({
      event: 'messages.upsert',
      instance: 'inst-abc',
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false
        },
        message: {
          conversation: 'Olá'
        },
        pushName: 'Fulano',
        messageTimestamp: 1700000000,
        messageType: 'text'
      },
      body: {
        sender: '5511888888888',
        destination: '5511999999999'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const args = (global.fetch as any).mock.calls[0];
    const sentBody = JSON.parse(args[1].body);
    expect(sentBody.user_id).toBe('user-123');
    expect(sentBody.company_id).toBeNull();
    expect(sentBody.company_name).toBe('ACME Ltd');
    expect(sentBody.instance_id).toBe('inst-abc');
    expect(sentBody.from_number).toBe('5511999999999');
  });

  it('inclui agent_prompt quando configurado na instância', async () => {
    const prisma = {
      evolutionInstance: {
        findFirst: jest.fn(async () => ({
          id: 'evo-1',
          userId: 'user-123',
          instanceId: 'inst-abc',
          providerInstanceId: 'prov-xyz',
          metadata: {},
          agentPrompt: 'PROMPT-DA-INST'
        }))
      },
      evolutionInstanceAgentPrompt: {
        findMany: jest.fn(async () => [])
      },
      lead: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      webhook: {
        create: jest.fn(async () => ({
          id: 'wh-1',
          userId: 'user-123',
          instanceId: 'inst-abc',
          providerInstanceId: 'prov-xyz'
        })),
        update: jest.fn(async () => ({}))
      },
      whatsappMessage: {
        upsert: jest.fn(async () => ({}))
      },
      user: {
        findUnique: jest.fn(async () => ({
          apiKey: 'apikey-1',
          companyName: 'ACME Ltd'
        }))
      }
    };
    const events = { emit: jest.fn() };
    const svc = new EvolutionWebhookService(prisma as any, events as any);

    await svc.handleWebhook({
      event: 'messages.upsert',
      instance: 'inst-abc',
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
          id: 'wamid-1'
        },
        message: {
          conversation: 'Olá'
        },
        pushName: 'Fulano',
        messageTimestamp: 1700000000,
        messageType: 'text'
      },
      body: {
        sender: '5511888888888',
        destination: '5511999999999'
      }
    });

    const args = (global.fetch as any).mock.calls[0];
    const sentBody = JSON.parse(args[1].body);
    expect(sentBody.agent_prompt).toBe('PROMPT-DA-INST');
    expect(sentBody.instance.agent_prompt).toBe('PROMPT-DA-INST');
  });

  it('envia 1 webhook por prompt vinculado (ex.: 50/50 => 2 envios)', async () => {
    const prisma = {
      evolutionInstance: {
        findFirst: jest.fn(async () => ({
          id: 'evo-1',
          userId: 'user-123',
          instanceId: 'inst-abc',
          providerInstanceId: 'prov-xyz',
          metadata: {}
        }))
      },
      evolutionInstanceAgentPrompt: {
        findMany: jest.fn(async () => [
          {
            agentPromptId: 'p1',
            percent: 50,
            agentPrompt: { id: 'p1', name: 'Prompt 1', prompt: 'TEXTO 1', active: true }
          },
          {
            agentPromptId: 'p2',
            percent: 50,
            agentPrompt: { id: 'p2', name: 'Prompt 2', prompt: 'TEXTO 2', active: true }
          }
        ])
      },
      lead: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      webhook: {
        create: jest.fn(async () => ({
          id: 'wh-1',
          userId: 'user-123',
          instanceId: 'inst-abc',
          providerInstanceId: 'prov-xyz'
        })),
        update: jest.fn(async () => ({}))
      },
      whatsappMessage: {
        upsert: jest.fn(async () => ({}))
      },
      user: {
        findUnique: jest.fn(async () => ({
          apiKey: 'apikey-1',
          companyName: 'ACME Ltd'
        }))
      }
    };
    const events = { emit: jest.fn() };
    const svc = new EvolutionWebhookService(prisma as any, events as any);

    await svc.handleWebhook({
      event: 'messages.upsert',
      instance: 'inst-abc',
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
          id: 'wamid-1'
        },
        message: {
          conversation: 'Olá'
        },
        pushName: 'Fulano',
        messageTimestamp: 1700000000,
        messageType: 'text'
      },
      body: {
        sender: '5511888888888',
        destination: '5511999999999'
      }
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const body1 = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    const body2 = JSON.parse((global.fetch as any).mock.calls[1][1].body);
    expect([body1.prompt_id, body2.prompt_id].sort()).toEqual(['p1', 'p2']);
    expect([body1.agent_prompt, body2.agent_prompt].sort()).toEqual(['TEXTO 1', 'TEXTO 2']);
    expect([body1.percent, body2.percent].sort()).toEqual([50, 50]);
  });
});
