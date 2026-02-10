import { AgentPromptService } from '../../src/users/agent-prompt.service';

describe('AgentPromptService (biblioteca + vínculos por instância)', () => {
  it('createPrompt cria um prompt na biblioteca', async () => {
    const prisma = {
      agentPrompt: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async (args: any) => ({ id: 'p1', ...args.data }))
      },
      legacyAgentPrompt: {
        findUnique: jest.fn(),
        upsert: jest.fn()
      }
    };
    const svc = new AgentPromptService(prisma as any);
    const created = await svc.createPrompt('user1', { name: 'Teste', prompt: 'Olá' });
    expect((created as any).id).toBe('p1');
    expect((created as any).userId).toBe('user1');
    expect((created as any).prompt).toBe('Olá');
  });

  it('createPrompt rejeita nome duplicado (case-insensitive)', async () => {
    const prisma = {
      agentPrompt: {
        findMany: jest.fn(async () => [{ id: 'p1', name: 'Prompt 1' }]),
        create: jest.fn()
      },
      legacyAgentPrompt: {
        findUnique: jest.fn(),
        upsert: jest.fn()
      }
    };
    const svc = new AgentPromptService(prisma as any);
    await expect(svc.createPrompt('user1', { name: 'prompt 1', prompt: 'Olá' })).rejects.toThrow('Já existe um prompt com esse nome');
  });

  it('setInstancePromptLinks valida soma 100 e persiste vínculos', async () => {
    const tx = {
      evolutionInstanceAgentPrompt: {
        deleteMany: jest.fn(async () => ({})),
        createMany: jest.fn(async () => ({}))
      }
    };
    const prisma = {
      evolutionInstance: {
        findFirst: jest.fn(async () => ({ id: 'evo-1', instanceId: 'inst-1', providerInstanceId: 'prov-1' }))
      },
      agentPrompt: {
        findMany: jest.fn(async () => [{ id: 'p1' }, { id: 'p2' }])
      },
      evolutionInstanceAgentPrompt: {
        findMany: jest.fn(async () => [
          {
            agentPromptId: 'p1',
            percent: 50,
            active: true,
            agentPrompt: { id: 'p1', name: 'P1', prompt: 'T1', active: true, createdAt: new Date(), updatedAt: new Date() }
          },
          {
            agentPromptId: 'p2',
            percent: 50,
            active: true,
            agentPrompt: { id: 'p2', name: 'P2', prompt: 'T2', active: true, createdAt: new Date(), updatedAt: new Date() }
          }
        ])
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      legacyAgentPrompt: {
        findUnique: jest.fn(),
        upsert: jest.fn()
      }
    };
    const svc = new AgentPromptService(prisma as any);
    const res = await svc.setInstancePromptLinks('user1', 'inst-1', [
      { promptId: 'p1', percent: 50, active: true },
      { promptId: 'p2', percent: 50, active: true }
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.evolutionInstanceAgentPrompt.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user1', evolutionInstanceId: 'evo-1' } });
    expect(tx.evolutionInstanceAgentPrompt.createMany).toHaveBeenCalledTimes(1);
    expect(res.links).toHaveLength(2);
  });
});
