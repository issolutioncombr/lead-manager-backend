import { Body, Controller, Post, HttpCode, HttpStatus, Headers, UnauthorizedException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { EvolutionWebhookService } from './evolution-webhook.service';

@Controller('webhooks/evolution')
export class EvolutionWebhookController {
  constructor(private readonly webhookService: EvolutionWebhookService) {}

  @Public() // Webhook é público (protegido por token se configurado, mas aqui deixaremos aberto ou validaremos no service)
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Headers('authorization') auth: string | undefined, @Body() payload: any) {
    const expected = process.env.EVOLUTION_WEBHOOK_AUTHORIZATION;
    if (expected && expected.length > 0) {
      if (!auth || auth !== expected) {
        throw new UnauthorizedException('Invalid webhook authorization');
      }
    }
    // Processa assincronamente para não travar a Evolution
    // Em produção, idealmente usaria uma fila (BullMQ)
    this.webhookService.handleWebhook(payload).catch(err => {
      console.error('Erro no processamento do webhook em background:', err);
    });

    return { status: 'received' };
  }
}
