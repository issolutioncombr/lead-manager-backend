import { AgentPromptService } from '../../src/users/agent-prompt.service';

describe('AgentPromptService (prompt por instância)', () => {
  it('getPromptForInstance retorna agentPrompt da EvolutionInstance', async () => {
    const prisma = {
      evolutionInstance: {
        findFirst: jest.fn(async () => ({ agentPrompt: 'PROMPT-1' }))
      },
      agentPrompt: {
        findUnique: jest.fn(async () => ({ prompt: 'USER-PROMPT' })),
        upsert: jest.fn(async () => ({ prompt: 'USER-PROMPT' }))
      }
    };
    const svc = new AgentPromptService(prisma as any);
    const res = await svc.getPromptForInstance('user1', 'inst1');
    expect(res).toBe('PROMPT-1');
  });

  it('updatePromptForInstance atualiza agentPrompt da EvolutionInstance', async () => {
    const prisma = {
      evolutionInstance: {
        findFirst: jest.fn(async () => ({ id: 'evo-1' })),
        update: jest.fn(async () => ({ id: 'evo-1' }))
      },
      agentPrompt: {
        findUnique: jest.fn(async () => ({ prompt: 'USER-PROMPT' })),
        upsert: jest.fn(async () => ({ prompt: 'USER-PROMPT' }))
      }
    };
    const svc = new AgentPromptService(prisma as any);
    const res = await svc.updatePromptForInstance('user1', 'inst1', 'NOVO');
    expect(res).toBe('NOVO');
    expect(prisma.evolutionInstance.update).toHaveBeenCalledWith({ where: { id: 'evo-1' }, data: { agentPrompt: 'NOVO' } });
  });
});

