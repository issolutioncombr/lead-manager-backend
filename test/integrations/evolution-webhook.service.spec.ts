import { EvolutionWebhookService } from '../../src/integrations/evolution-webhook.service';

describe('EvolutionWebhookService', () => {
  it('não cria WhatsappMessage quando messages.update não acha match por wamid', async () => {
    const prisma = {
      evolutionInstance: {
        findFirst: jest.fn(async () => ({
          userId: 'user1',
          instanceId: 'inst1',
          providerInstanceId: 'prov1'
        }))
      },
      webhook: {
        create: jest.fn(async () => ({ id: 'w1' }))
      },
      whatsappMessage: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        upsert: jest.fn(async () => ({ id: 'm1' }))
      }
    };
    const events = { emit: jest.fn() };
    const svc = new EvolutionWebhookService(prisma as any, events as any);

    await svc.handleMessagesUpdate({
      event: 'messages.update',
      instance: 'prov1',
      data: {
        keyId: 'provider-123',
        remoteJid: '553281234567@s.whatsapp.net',
        status: 'DELIVERED'
      }
    });

    expect(prisma.whatsappMessage.updateMany).toHaveBeenCalled();
    expect(prisma.whatsappMessage.upsert).not.toHaveBeenCalled();
    expect(prisma.webhook.create).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user1', phoneRaw: '553281234567', event: 'messages.update' })
    );
  });
});

