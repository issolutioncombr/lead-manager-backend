import { UnauthorizedException } from '@nestjs/common';
import { EvolutionWebhookController } from '../../src/integrations/evolution-webhook.controller';

describe('EvolutionWebhookController', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('rate limit retorna 429 após muitas requisições por token', async () => {
    process.env.EVOLUTION_WEBHOOK_TOKEN = 'secret';
    const svc = {
      handleWebhook: jest.fn(async () => {}),
      handleConnectionUpdate: jest.fn(async () => {}),
      handleMessagesUpdate: jest.fn(async () => {}),
      handleContactsUpdate: jest.fn(async () => {}),
      handleChatsUpdate: jest.fn(async () => {}),
      handleChatsUpsert: jest.fn(async () => {}),
      dispatchByEvent: jest.fn(async () => {})
    };
    const controller = new EvolutionWebhookController(svc as any);

    for (let i = 0; i < 10_000; i += 1) {
      await controller.handleWebhook('secret', {});
    }
    await expect(controller.handleWebhook('secret', {})).rejects.toMatchObject({ status: 429 });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('bloqueia webhook quando EVOLUTION_WEBHOOK_TOKEN não confere', async () => {
    process.env.EVOLUTION_WEBHOOK_TOKEN = 'secret';
    const svc = {
      handleWebhook: jest.fn(async () => {}),
      handleConnectionUpdate: jest.fn(async () => {}),
      handleMessagesUpdate: jest.fn(async () => {}),
      handleContactsUpdate: jest.fn(async () => {}),
      handleChatsUpdate: jest.fn(async () => {}),
      handleChatsUpsert: jest.fn(async () => {}),
      dispatchByEvent: jest.fn(async () => {})
    };
    const controller = new EvolutionWebhookController(svc as any);

    await expect(controller.handleWebhook('wrong', {})).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.handleMessagesUpdate(undefined, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('aceita webhook quando EVOLUTION_WEBHOOK_TOKEN confere', async () => {
    process.env.EVOLUTION_WEBHOOK_TOKEN = 'secret';
    const svc = {
      handleWebhook: jest.fn(async () => {}),
      handleConnectionUpdate: jest.fn(async () => {}),
      handleMessagesUpdate: jest.fn(async () => {}),
      handleContactsUpdate: jest.fn(async () => {}),
      handleChatsUpdate: jest.fn(async () => {}),
      handleChatsUpsert: jest.fn(async () => {}),
      dispatchByEvent: jest.fn(async () => {})
    };
    const controller = new EvolutionWebhookController(svc as any);

    const res = await controller.handleWebhook('secret', { body: { event: 'messages.upsert' } });
    expect(res).toEqual({ status: 'received' });
    expect(svc.handleWebhook).toHaveBeenCalledTimes(1);
  });
});
