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
    const expectedAuth = (process.env.EVOLUTION_WEBHOOK_AUTHORIZATION ?? '').trim();
    const expectedToken = (process.env.EVOLUTION_WEBHOOK_TOKEN ?? '').trim();
    const normalize = (v?: string) => (v?.startsWith('Bearer ') ? v.slice(7) : v)?.trim();
    const provided = normalize(auth) ?? (tokenHeader ?? '').trim();

    if (expectedAuth || expectedToken) {
      const validValues = [expectedAuth, expectedToken].filter(Boolean);
      if (!provided || !validValues.includes(provided)) {
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
