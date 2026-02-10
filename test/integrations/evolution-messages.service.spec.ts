import { BadRequestException } from '@nestjs/common';
import { EvolutionMessagesService } from '../../src/integrations/evolution-messages.service';

class MockPrisma {
  whatsappMessage = {
    upsert: jest.fn(async () => ({})),
    update: jest.fn(async () => ({})),
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => null),
    count: jest.fn(async () => 0)
  };

  lead = {
    findMany: jest.fn(async () => [])
  };

  evolutionInstance = {
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => [])
  };
}

class MockEvolution {
  sendMessage = jest.fn(async () => ({ status: 'sent' }));
  fetchProfilePicUrl = jest.fn(async () => null);
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

  it('listConversation pagina para trás com beforeTimestamp e retorna nextCursor/hasMore', async () => {
    prisma.whatsappMessage.findMany = jest.fn(async () => [
      {
        wamid: 'wamid-4',
        fromMe: true,
        instanceId: 'inst1',
        conversation: 'm4',
        mediaUrl: null,
        caption: null,
        messageType: 'text',
        deliveryStatus: 'SENT',
        timestamp: new Date('2026-02-04T09:00:04.000Z'),
        updatedAt: new Date('2026-02-04T09:00:04.000Z'),
        pushName: null
      },
      {
        wamid: 'wamid-3',
        fromMe: false,
        instanceId: 'inst1',
        conversation: 'm3',
        mediaUrl: null,
        caption: null,
        messageType: 'text',
        deliveryStatus: null,
        timestamp: new Date('2026-02-04T09:00:03.000Z'),
        updatedAt: new Date('2026-02-04T09:00:03.000Z'),
        pushName: 'Fulano'
      }
    ]) as any;
    prisma.whatsappMessage.findFirst = jest.fn(async () => ({ id: 'older' })) as any;

    const res = await svc.listConversation('user1', '+5511999999999', {
      source: 'local',
      limit: 2,
      beforeTimestamp: '2026-02-04T09:00:05.000Z'
    });

    expect(res.data).toHaveLength(2);
    expect(new Date(res.data[0].timestamp).toISOString()).toBe('2026-02-04T09:00:03.000Z');
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toBe('2026-02-04T09:00:03.000Z');
    expect(res.data[1].originInstanceId).toBe('inst1');
    const call = (prisma.whatsappMessage.findMany as any).mock.calls[0][0];
    expect(call.take).toBe(2);
  });

  it('listConversation com instanceId inclui mensagens legadas sem instanceId (para inbound antigo)', async () => {
    prisma.evolutionInstance.findMany = jest.fn(async () => [
      { instanceId: 'inst1', providerInstanceId: null, metadata: { number: '5511999999999' } }
    ]) as any;
    prisma.whatsappMessage.findMany = jest.fn(async () => [
      {
        wamid: 'wamid-in',
        fromMe: false,
        instanceId: null,
        conversation: 'inbound antigo',
        mediaUrl: null,
        caption: null,
        messageType: 'text',
        deliveryStatus: null,
        timestamp: new Date('2026-02-04T09:00:01.000Z'),
        updatedAt: new Date('2026-02-04T09:00:01.000Z'),
        pushName: 'Fulano'
      },
      {
        wamid: 'wamid-out',
        fromMe: true,
        instanceId: 'inst1',
        conversation: 'outbound',
        mediaUrl: null,
        caption: null,
        messageType: 'text',
        deliveryStatus: 'SENT',
        timestamp: new Date('2026-02-04T09:00:02.000Z'),
        updatedAt: new Date('2026-02-04T09:00:02.000Z'),
        pushName: null
      }
    ]) as any;

    const res = await svc.listConversation('user1', '+5511999999999', {
      source: 'local',
      limit: 10,
      instanceId: 'inst1'
    });
    expect(res.data.some((m: any) => m.wamid === 'wamid-in')).toBe(true);
    expect(res.data.some((m: any) => m.wamid === 'wamid-out')).toBe(true);
  });

  it('listChats enriquece avatarUrl via profile-pic quando ausente', async () => {
    prisma.evolutionInstance.findFirst = jest.fn(async () => ({ instanceId: 'inst1', providerInstanceId: null })) as any;
    prisma.whatsappMessage.findMany = jest.fn(async () => [
      {
        wamid: 'wamid-1',
        phoneRaw: '5511999999999',
        remoteJid: '5511999999999@s.whatsapp.net',
        instanceId: 'inst1',
        fromMe: false,
        conversation: 'oi',
        mediaUrl: null,
        caption: null,
        timestamp: new Date('2026-02-04T09:00:00.000Z'),
        updatedAt: new Date('2026-02-04T09:00:00.000Z'),
        pushName: 'Fulano'
      }
    ]) as any;
    evolution.fetchProfilePicUrl = jest.fn(async () => 'https://cdn.example.com/pic.jpg') as any;

    const chats = await svc.listChats('user1', { source: 'local', limit: 50, instanceId: 'inst1' });
    expect(Array.isArray(chats)).toBe(true);
    expect(chats.length).toBeGreaterThan(0);
    expect(chats[0].avatarUrl).toBe('https://cdn.example.com/pic.jpg');
    expect(chats[0].originInstanceId).toBe('inst1');
  });

  it('getProfilePicUrl usa cache por instanceId+jid quando instanceId é fornecido', async () => {
    evolution.fetchProfilePicUrl = jest.fn(async () => 'https://cdn.example.com/a.jpg') as any;
    const jid = '5511999999999@s.whatsapp.net';
    const a = await svc.getProfilePicUrl('user1', { jid, instanceId: 'inst1' });
    const b = await svc.getProfilePicUrl('user1', { jid, instanceId: 'inst1' });
    expect(a).toBe('https://cdn.example.com/a.jpg');
    expect(b).toBe('https://cdn.example.com/a.jpg');
    expect(evolution.fetchProfilePicUrl).toHaveBeenCalledTimes(1);
  });

  it('listChats em "todas instâncias" permite o mesmo destino com origens diferentes', async () => {
    prisma.evolutionInstance.findMany = jest.fn(async () => [
      { instanceId: 'instA', providerInstanceId: null, metadata: { number: '5511111111111', profilePicUrl: null } },
      { instanceId: 'instB', providerInstanceId: null, metadata: { number: '5522222222222', profilePicUrl: null } }
    ]) as any;
    prisma.whatsappMessage.findMany = jest.fn(async () => [
      {
        wamid: 'wamid-a',
        phoneRaw: '5511999999999',
        remoteJid: '5511999999999@s.whatsapp.net',
        instanceId: 'instA',
        fromMe: false,
        conversation: 'oi',
        mediaUrl: null,
        caption: null,
        timestamp: new Date('2026-02-04T09:00:00.000Z'),
        updatedAt: new Date('2026-02-04T09:00:00.000Z'),
        pushName: 'Fulano'
      },
      {
        wamid: 'wamid-b',
        phoneRaw: '5511999999999',
        remoteJid: '5511999999999@s.whatsapp.net',
        instanceId: 'instB',
        fromMe: false,
        conversation: 'oi 2',
        mediaUrl: null,
        caption: null,
        timestamp: new Date('2026-02-04T09:00:01.000Z'),
        updatedAt: new Date('2026-02-04T09:00:01.000Z'),
        pushName: 'Fulano'
      }
    ]) as any;

    const chats = await svc.listChats('user1', { source: 'local', limit: 50 });
    const sameContact = chats.filter((c: any) => c.contact === '5511999999999');
    expect(sameContact).toHaveLength(2);
    expect(new Set(sameContact.map((c: any) => c.originInstanceId)).size).toBe(2);
  });
});
