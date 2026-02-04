import { BadRequestException } from '@nestjs/common';
import { EvolutionMessagesService } from '../../src/integrations/evolution-messages.service';

class MockPrisma {
  whatsappMessage = {
    upsert: jest.fn(async () => ({})),
    update: jest.fn(async () => ({})),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0)
  };

  lead = {
    findMany: jest.fn(async () => [])
  };

  evolutionInstance = {
    findFirst: jest.fn(async () => null)
  };
}

class MockEvolution {
  sendMessage = jest.fn(async () => ({ status: 'sent' }));
}

class MockEvents {
  emit = jest.fn();
  on = jest.fn(() => ({ subscribe: () => ({ unsubscribe: () => {} }) }));
}

describe('EvolutionMessagesService (TS)', () => {
  let prisma: MockPrisma;
  let evolution: MockEvolution;
  let events: MockEvents;
  let svc: EvolutionMessagesService;

  beforeEach(() => {
    prisma = new MockPrisma();
    evolution = new MockEvolution();
    events = new MockEvents();
    svc = new EvolutionMessagesService(prisma as any, evolution as any, events as any);
    global.fetch = jest.fn() as any;
  });

  it('enfileira e envia mensagem de texto', async () => {
    const res = await svc.sendMessage('user1', { phone: '+5511999999999', text: 'olá' });
    expect(res.status).toBe('sent');
    expect(prisma.whatsappMessage.upsert).toHaveBeenCalled();
    expect(prisma.whatsappMessage.update).toHaveBeenCalled();
    expect(evolution.sendMessage).toHaveBeenCalled();
  });

  it('bloqueia por rate limit ao exceder 30 envios', async () => {
    const calls = Array.from({ length: 30 }).map(() => svc.sendMessage('user2', { phone: '+5511988887777', text: 'x' }));
    await Promise.all(calls);
    await expect(svc.sendMessage('user2', { phone: '+5511988887777', text: 'y' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falha validação de mídia muito grande', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: {
        get: (key: string) => (key === 'content-type' ? 'image/jpeg' : key === 'content-length' ? String(20 * 1024 * 1024) : null)
      }
    })) as any;
    await expect(
      svc.sendMessage('user3', {
        phone: '+5511977776666',
        mediaUrl: 'http://example.com/image.jpg',
        caption: 'img'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listUpdates retorna deltas por cursor (timestamp/updatedAt)', async () => {
    prisma.whatsappMessage.findMany = jest.fn(async () => [
      {
        id: 'db1',
        wamid: 'wamid-1',
        fromMe: false,
        direction: 'INBOUND',
        conversation: 'oi',
        caption: null,
        mediaUrl: null,
        messageType: 'text',
        deliveryStatus: null,
        timestamp: new Date('2026-02-04T09:00:00.000Z'),
        updatedAt: new Date('2026-02-04T09:00:01.000Z'),
        pushName: 'Fulano',
        phoneRaw: '5511999999999'
      },
      {
        id: 'db2',
        wamid: 'wamid-2',
        fromMe: true,
        direction: 'OUTBOUND',
        conversation: 'ok',
        caption: null,
        mediaUrl: null,
        messageType: 'text',
        deliveryStatus: 'SENT',
        timestamp: new Date('2026-02-04T09:00:02.000Z'),
        updatedAt: new Date('2026-02-04T09:00:03.000Z'),
        pushName: null,
        phoneRaw: '5511999999999'
      }
    ]) as any;
    const res = await svc.listUpdates('user1', '+5511999999999', {
      source: 'local',
      limit: 50,
      afterTimestamp: '2026-02-04T08:59:59.000Z',
      afterUpdatedAt: '2026-02-04T08:59:59.000Z'
    });
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data).toHaveLength(2);
    expect(res.cursor).toBeDefined();
    expect(res.cursor.lastTimestamp).toBe('2026-02-04T09:00:02.000Z');
    expect(res.cursor.lastUpdatedAt).toBe('2026-02-04T09:00:03.000Z');
    const call = (prisma.whatsappMessage.findMany as any).mock.calls[0][0];
    expect(call.take).toBe(50);
    expect(call.where.userId).toBe('user1');
  });

  it('listUpdates bloqueia source=provider e valida telefone', async () => {
    await expect(svc.listUpdates('user1', '+123', { source: 'local' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.listUpdates('user1', '+5511999999999', { source: 'provider' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});

