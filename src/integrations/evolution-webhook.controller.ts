import { Body, Controller, Post, HttpCode, HttpStatus, Headers, UnauthorizedException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { EvolutionWebhookService } from './evolution-webhook.service';

@Controller('webhooks/evolution')
export class EvolutionWebhookController {
  constructor(private readonly webhookService: EvolutionWebhookService) {}

  @Public() // Webhook é público (protegido por token se configurado, mas aqui deixaremos aberto ou validaremos no service)
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('authorization') auth: string | undefined,
    @Headers('x-evolution-webhook-token') tokenHeader: string | undefined,
    @Body() payload: any
  ) {
    const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    const expectedAuth = process.env.EVOLUTION_WEBHOOK_AUTHORIZATION;
    const tokenValid = expectedToken ? tokenHeader === expectedToken : true;
    const authValid = expectedAuth ? auth === expectedAuth : true;
    if (!(tokenValid && authValid)) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }
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
  async handleConnectionUpdate(
    @Headers('authorization') auth: string | undefined,
    @Headers('x-evolution-webhook-token') tokenHeader: string | undefined,
    @Body() payload: any
  ) {
    const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    const expectedAuth = process.env.EVOLUTION_WEBHOOK_AUTHORIZATION;
    const tokenValid = expectedToken ? tokenHeader === expectedToken : true;
    const authValid = expectedAuth ? auth === expectedAuth : true;
    if (!(tokenValid && authValid)) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }
    this.webhookService.handleConnectionUpdate(payload).catch(() => {});
    return { status: 'received' };
  }

  @Public()
  @Post('messages-upsert')
  @HttpCode(HttpStatus.OK)
  async handleMessagesUpsert(
    @Headers('authorization') auth: string | undefined,
    @Headers('x-evolution-webhook-token') tokenHeader: string | undefined,
    @Body() payload: any
  ) {
    const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    const expectedAuth = process.env.EVOLUTION_WEBHOOK_AUTHORIZATION;
    const tokenValid = expectedToken ? tokenHeader === expectedToken : true;
    const authValid = expectedAuth ? auth === expectedAuth : true;
    if (!(tokenValid && authValid)) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }
    this.webhookService.handleWebhook(payload).catch(() => {});
    return { status: 'received' };
  }

  @Public()
  @Post('messages-update')
  @HttpCode(HttpStatus.OK)
  async handleMessagesUpdate(
    @Headers('authorization') auth: string | undefined,
    @Headers('x-evolution-webhook-token') tokenHeader: string | undefined,
    @Body() payload: any
  ) {
    const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    const expectedAuth = process.env.EVOLUTION_WEBHOOK_AUTHORIZATION;
    const tokenValid = expectedToken ? tokenHeader === expectedToken : true;
    const authValid = expectedAuth ? auth === expectedAuth : true;
    if (!(tokenValid && authValid)) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }
    this.webhookService.handleMessagesUpdate(payload).catch(() => {});
    return { status: 'received' };
  }

  @Public()
  @Post('contacts-update')
  @HttpCode(HttpStatus.OK)
  async handleContactsUpdate(
    @Headers('authorization') auth: string | undefined,
    @Headers('x-evolution-webhook-token') tokenHeader: string | undefined,
    @Body() payload: any
  ) {
    const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    const expectedAuth = process.env.EVOLUTION_WEBHOOK_AUTHORIZATION;
    const tokenValid = expectedToken ? tokenHeader === expectedToken : true;
    const authValid = expectedAuth ? auth === expectedAuth : true;
    if (!(tokenValid && authValid)) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }
    this.webhookService.handleContactsUpdate(payload).catch(() => {});
    return { status: 'received' };
  }

  @Public()
  @Post('chats-update')
  @HttpCode(HttpStatus.OK)
  async handleChatsUpdate(
    @Headers('authorization') auth: string | undefined,
    @Headers('x-evolution-webhook-token') tokenHeader: string | undefined,
    @Body() payload: any
  ) {
    const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    const expectedAuth = process.env.EVOLUTION_WEBHOOK_AUTHORIZATION;
    const tokenValid = expectedToken ? tokenHeader === expectedToken : true;
    const authValid = expectedAuth ? auth === expectedAuth : true;
    if (!(tokenValid && authValid)) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }
    this.webhookService.handleChatsUpdate(payload).catch(() => {});
    return { status: 'received' };
  }

  @Public()
  @Post('chats-upsert')
  @HttpCode(HttpStatus.OK)
  async handleChatsUpsert(
    @Headers('authorization') auth: string | undefined,
    @Headers('x-evolution-webhook-token') tokenHeader: string | undefined,
    @Body() payload: any
  ) {
    const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    const expectedAuth = process.env.EVOLUTION_WEBHOOK_AUTHORIZATION;
    const tokenValid = expectedToken ? tokenHeader === expectedToken : true;
    const authValid = expectedAuth ? auth === expectedAuth : true;
    if (!(tokenValid && authValid)) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }
    this.webhookService.handleChatsUpsert(payload).catch(() => {});
    return { status: 'received' };
  }

  @Public()
  @Post(':event')
  @HttpCode(HttpStatus.OK)
  async handleGenericEvent(
    @Headers('authorization') auth: string | undefined,
    @Headers('x-evolution-webhook-token') tokenHeader: string | undefined,
    @Body() payload: any
  ) {
    const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    const expectedAuth = process.env.EVOLUTION_WEBHOOK_AUTHORIZATION;
    const tokenValid = expectedToken ? tokenHeader === expectedToken : true;
    const authValid = expectedAuth ? auth === expectedAuth : true;
    if (!(tokenValid && authValid)) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }
    await this.webhookService.dispatchByEvent(payload).catch(() => {});
    return { status: 'received' };
  }
}
