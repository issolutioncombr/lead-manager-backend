import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { EvolutionWebhookService } from './evolution-webhook.service';

@Controller('webhooks/evolution')
export class EvolutionWebhookController {
  constructor(private readonly webhookService: EvolutionWebhookService) {}

  @Public() // Webhook é público (protegido por token se configurado, mas aqui deixaremos aberto ou validaremos no service)
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: any) {
    // Processa assincronamente para não travar a Evolution
    // Em produção, idealmente usaria uma fila (BullMQ)
    this.webhookService.handleWebhook(payload).catch(err => {
      console.error('Erro no processamento do webhook em background:', err);
    });

    return { status: 'received' };
  }

  @Public()
  @Post('connection-update')
  @HttpCode(HttpStatus.OK)
  async handleConnectionUpdate(@Body() payload: any) {
    this.webhookService.handleConnectionUpdate(payload).catch(() => {});
    return { status: 'received' };
  }

  @Public()
  @Post('messages-upsert')
  @HttpCode(HttpStatus.OK)
  async handleMessagesUpsert(@Body() payload: any) {
    this.webhookService.handleWebhook(payload).catch(() => {});
    return { status: 'received' };
  }

  @Public()
  @Post('messages-update')
  @HttpCode(HttpStatus.OK)
  async handleMessagesUpdate(@Body() payload: any) {
    this.webhookService.handleMessagesUpdate(payload).catch(() => {});
    return { status: 'received' };
  }

  @Public()
  @Post('contacts-update')
  @HttpCode(HttpStatus.OK)
  async handleContactsUpdate(@Body() payload: any) {
    this.webhookService.handleContactsUpdate(payload).catch(() => {});
    return { status: 'received' };
  }

  @Public()
  @Post('chats-update')
  @HttpCode(HttpStatus.OK)
  async handleChatsUpdate(@Body() payload: any) {
    this.webhookService.handleChatsUpdate(payload).catch(() => {});
    return { status: 'received' };
  }
  
  @Public()
  @Post('chats-upsert')
  @HttpCode(HttpStatus.OK)
  async handleChatsUpsert(@Body() payload: any) {
    this.webhookService.handleChatsUpsert(payload).catch(() => {});
    return { status: 'received' };
  }

  @Public()
  @Post(':event')
  @HttpCode(HttpStatus.OK)
  async handleGenericEvent(@Body() payload: any) {
    await this.webhookService.dispatchByEvent(payload).catch(() => {});
    return { status: 'received' };
  }
}
