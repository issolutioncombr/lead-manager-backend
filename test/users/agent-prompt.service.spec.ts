import { AgentPromptService } from '../../src/users/agent-prompt.service';

describe('AgentPromptService (biblioteca + vínculos por instância)', () => {
  it('createPrompt cria um prompt na biblioteca', async () => {
    const prisma = {
      promptCategory: {
        findFirst: jest.fn(async () => ({ id: 'pc_default' }))
      },
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
    const created = await svc.createPrompt('user1', { categoryId: 'pc_default', name: 'Teste', prompt: 'Olá' });
    expect((created as any).id).toBe('p1');
    expect((created as any).userId).toBe('user1');
    expect((created as any).prompt).toBe('Olá');
  });

  it('createPrompt rejeita nome duplicado (case-insensitive)', async () => {
    const prisma = {
      promptCategory: {
        findFirst: jest.fn(async () => ({ id: 'pc_default' }))
      },
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
    await expect(svc.createPrompt('user1', { categoryId: 'pc_default', name: 'prompt 1', prompt: 'Olá' })).rejects.toThrow('Já existe um prompt com esse nome');
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
            percentBps: 5000,
            active: true,
            agentPrompt: { id: 'p1', name: 'P1', prompt: 'T1', active: true, createdAt: new Date(), updatedAt: new Date() }
          },
          {
            agentPromptId: 'p2',
            percentBps: 5000,
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

  it('deletePrompt redistribui percentuais e reatribui destinos quando possível', async () => {
    const tx = {
      evolutionInstanceAgentPrompt: {
        findMany: jest.fn(async (args: any) => {
          const where = args?.where ?? {};
          if (where?.agentPromptId === 'p1') {
            return [{ evolutionInstanceId: 'evo-1' }];
          }
          if (where?.evolutionInstanceId === 'evo-1' && where?.agentPromptId?.not === 'p1') {
            return [
              { id: 'link-2', agentPromptId: 'p2', percentBps: 5000, active: true, createdAt: new Date('2026-01-01') }
            ];
          }
          return [];
        }),
        update: jest.fn(async () => ({}))
      },
      evolutionInstancePromptAssignment: {
        updateMany: jest.fn(async () => ({}))
      },
      agentPrompt: {
        findFirst: jest.fn(async () => ({ id: 'p1' })),
        delete: jest.fn(async () => ({}))
      }
    };
    const prisma = {
      agentPrompt: tx.agentPrompt,
      evolutionInstanceAgentPrompt: tx.evolutionInstanceAgentPrompt,
      evolutionInstancePromptAssignment: tx.evolutionInstancePromptAssignment,
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      legacyAgentPrompt: { findUnique: jest.fn(), upsert: jest.fn() }
    };
    const svc = new AgentPromptService(prisma as any);
    await svc.deletePrompt('user1', 'p1');
    expect(tx.evolutionInstancePromptAssignment.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user1', evolutionInstanceId: 'evo-1', agentPromptId: 'p1' },
      data: { agentPromptId: 'p2', assignedBy: 'system' }
    });
    expect(tx.evolutionInstanceAgentPrompt.update).toHaveBeenCalledWith({ where: { id: 'link-2' }, data: { percentBps: 10000 } });
    expect(tx.agentPrompt.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});
