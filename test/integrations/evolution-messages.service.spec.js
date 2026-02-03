const { BadRequestException } = require('@nestjs/common');
const { EvolutionMessagesService } = require('../../dist/integrations/evolution-messages.service');

class MockPrisma {
  constructor() {
    this.whatsappMessage = {
      upsert: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0)
    };
  }
}

class MockEvolution {
  constructor() {
    this.sendMessage = jest.fn(async () => ({ status: 'sent' }));
  }
}

describe('EvolutionMessagesService (JS)', () => {
  let prisma;
  let evolution;
  let svc;

  beforeEach(() => {
    prisma = new MockPrisma();
    evolution = new MockEvolution();
    svc = new EvolutionMessagesService(prisma, evolution);
    global.fetch = jest.fn();
  });

  it('enfileira e envia mensagem de texto', async () => {
    const res = await svc.sendMessage('user1', { phone: '+5511999999999', text: 'olá' });
    expect(res.status).toBe('sent');
    expect(prisma.whatsappMessage.upsert).toHaveBeenCalled();
    expect(prisma.whatsappMessage.update).toHaveBeenCalled();
    expect(evolution.sendMessage).toHaveBeenCalled();
  });

  it('bloqueia por rate limit ao exceder 30 envios', async () => {
    const calls = Array.from({ length: 30 }).map(() =>
      svc.sendMessage('user2', { phone: '+5511988887777', text: 'x' })
    );
    await Promise.all(calls);
    await expect(
      svc.sendMessage('user2', { phone: '+5511988887777', text: 'y' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falha validação de mídia muito grande', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: {
        get: (key) => (key === 'content-type' ? 'image/jpeg' : key === 'content-length' ? String(20 * 1024 * 1024) : null)
      }
    }));
    await expect(
      svc.sendMessage('user3', {
        phone: '+5511977776666',
        mediaUrl: 'http://example.com/image.jpg',
        caption: 'img'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
