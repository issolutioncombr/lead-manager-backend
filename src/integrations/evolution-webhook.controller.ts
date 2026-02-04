import { Body, Controller, Headers, HttpCode, HttpException, HttpStatus, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { EvolutionWebhookService } from './evolution-webhook.service';

@Controller('webhooks/evolution')
export class EvolutionWebhookController {
  private readonly logger = new Logger(EvolutionWebhookController.name);
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly webhookService: EvolutionWebhookService) {}

  private ensureAccess(tokenHeader: string | undefined) {
    const expected = process.env.EVOLUTION_WEBHOOK_TOKEN;
    if (expected && tokenHeader !== expected) {
      throw new UnauthorizedException();
    }
    const nowMs = Date.now();
    const key = tokenHeader ?? 'anonymous';
    const bucket = this.buckets.get(key) ?? { count: 0, resetAt: nowMs + 60_000 };
    if (nowMs > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = nowMs + 60_000;
    }
    bucket.count += 1;
    this.buckets.set(key, bucket);
    if (bucket.count > 10_000) {
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  @Public() // Webhook é público (protegido por token se configurado, mas aqui deixaremos aberto ou validaremos no service)
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Headers('x-evolution-webhook-token') tokenHeader: string | undefined, @Body() payload: any) {
    this.ensureAccess(tokenHeader);
    // Processa assincronamente para não travar a Evolution
    // Em produção, idealmente usaria uma fila (BullMQ)
    this.webhookService.handleWebhook(payload).catch((err) => {
      this.logger.error('Erro no processamento do webhook em background', err?.stack ?? String(err));
    });

    return { status: 'received' };
  }

  @Public()
  @Post('connection-update')
  @HttpCode(HttpStatus.OK)
  async handleConnectionUpdate(@Headers('x-evolution-webhook-token') tokenHeader: string | undefined, @Body() payload: any) {
    this.ensureAccess(tokenHeader);
    this.webhookService.handleConnectionUpdate(payload).catch(() => {
      this.logger.warn('Falha ao processar connection-update');
    });
    return { status: 'received' };
  }

  @Public()
  @Post('messages-upsert')
  @HttpCode(HttpStatus.OK)
  async handleMessagesUpsert(@Headers('x-evolution-webhook-token') tokenHeader: string | undefined, @Body() payload: any) {
    this.ensureAccess(tokenHeader);
    this.webhookService.handleWebhook(payload).catch(() => {
      this.logger.warn('Falha ao processar messages-upsert');
    });
    return { status: 'received' };
  }

  @Public()
  @Post('messages-update')
  @HttpCode(HttpStatus.OK)
  async handleMessagesUpdate(@Headers('x-evolution-webhook-token') tokenHeader: string | undefined, @Body() payload: any) {
    this.ensureAccess(tokenHeader);
    this.webhookService.handleMessagesUpdate(payload).catch(() => {
      this.logger.warn('Falha ao processar messages-update');
    });
    return { status: 'received' };
  }

  @Public()
  @Post('contacts-update')
  @HttpCode(HttpStatus.OK)
  async handleContactsUpdate(@Headers('x-evolution-webhook-token') tokenHeader: string | undefined, @Body() payload: any) {
    this.ensureAccess(tokenHeader);
    this.webhookService.handleContactsUpdate(payload).catch(() => {
      this.logger.warn('Falha ao processar contacts-update');
    });
    return { status: 'received' };
  }

  @Public()
  @Post('chats-update')
  @HttpCode(HttpStatus.OK)
  async handleChatsUpdate(@Headers('x-evolution-webhook-token') tokenHeader: string | undefined, @Body() payload: any) {
    this.ensureAccess(tokenHeader);
    this.webhookService.handleChatsUpdate(payload).catch(() => {
      this.logger.warn('Falha ao processar chats-update');
    });
    return { status: 'received' };
  }
  
  @Public()
  @Post('chats-upsert')
  @HttpCode(HttpStatus.OK)
  async handleChatsUpsert(@Headers('x-evolution-webhook-token') tokenHeader: string | undefined, @Body() payload: any) {
    this.ensureAccess(tokenHeader);
    this.webhookService.handleChatsUpsert(payload).catch(() => {
      this.logger.warn('Falha ao processar chats-upsert');
    });
    return { status: 'received' };
  }

  @Public()
  @Post(':event')
  @HttpCode(HttpStatus.OK)
  async handleGenericEvent(@Headers('x-evolution-webhook-token') tokenHeader: string | undefined, @Body() payload: any) {
    this.ensureAccess(tokenHeader);
    await this.webhookService.dispatchByEvent(payload).catch(() => {
      this.logger.warn('Falha ao processar evento genérico');
    });
    return { status: 'received' };
  }
}
