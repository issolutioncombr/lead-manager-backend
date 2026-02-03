import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PhoneInstancesService {
  private readonly logger = new Logger(PhoneInstancesService.name);
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return (this.prisma as any).whatsappPhoneInstance.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async performAction(userId: string, id: string, action: 'travar' | 'pausar' | 'reativar', actorUserId?: string) {
    const inst = await (this.prisma as any).whatsappPhoneInstance.findFirst({
      where: { id, userId }
    });
    if (!inst) throw new NotFoundException('Instância não encontrada');

    const now = new Date();
    let botStatus = inst.botStatus ?? 'ATIVO';
    if (action === 'travar') botStatus = 'TRAVADO';
    if (action === 'pausar') botStatus = 'PAUSADO';
    if (action === 'reativar') botStatus = 'ATIVO';

    const updated = await (this.prisma as any).whatsappPhoneInstance.update({
      where: { id },
      data: {
        botStatus,
        botTravarAt: action === 'travar' ? now : inst.botTravarAt,
        botPausarAt: action === 'pausar' ? now : inst.botPausarAt,
        botReativarAt: action === 'reativar' ? now : inst.botReativarAt
      }
    });

    await (this.prisma as any).botActionLog.create({
      data: {
        userId,
        phoneInstanceId: id,
        action: action.toUpperCase(),
        timestamp: now,
        actorUserId: actorUserId ?? userId
      }
    });

    const config = updated.botWebhookConfigId
      ? await (this.prisma as any).webhookConfig.findFirst({
          where: { id: updated.botWebhookConfigId, userId, active: true }
        })
      : null;

    if (config) {
      const payload = {
        origin: 'bot-control',
        userId,
        instanceId: updated.instanceId,
        providerInstanceId: updated.providerInstanceId,
        phoneRaw: updated.phoneRaw,
        status: botStatus,
        action,
        timestamp: now.toISOString()
      };

      const createdWebhook = await (this.prisma as any).webhook.create({
        data: {
          userId,
          instanceId: updated.instanceId,
          providerInstanceId: updated.providerInstanceId,
          phoneRaw: updated.phoneRaw,
          receivedAt: now,
          rawJson: payload
        }
      });

      await (this.prisma as any).webhook.update({
        where: { id: createdWebhook.id },
        data: {
          outboundJson: payload,
          outboundUrl: config.url
        }
      });

      try {
        const resp = await fetch(config.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(config.headers ?? {}) },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          await (this.prisma as any).webhook.update({
            where: { id: createdWebhook.id },
            data: { status: 'sent', sentAt: new Date() }
          });
        }
      } catch (err) {
        this.logger.warn(`Falha ao enviar webhook de bot-control: ${err}`);
      }
    }

    return updated;
  }

  logs(userId: string, id: string) {
    return (this.prisma as any).botActionLog.findMany({
      where: { userId, phoneInstanceId: id },
      orderBy: { timestamp: 'desc' }
    });
  }

  async linkWebhookConfig(userId: string, id: string, webhookConfigId: string | null) {
    const inst = await (this.prisma as any).whatsappPhoneInstance.findFirst({
      where: { id, userId }
    });
    if (!inst) throw new NotFoundException('Instância não encontrada');
    return (this.prisma as any).whatsappPhoneInstance.update({
      where: { id },
      data: { botWebhookConfigId: webhookConfigId ?? null }
    });
  }
}
