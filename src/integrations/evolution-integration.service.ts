import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EvolutionInstanceSummary, EvolutionService } from './evolution.service';

/**
 * Slots pre-configurados para provisionar instancias Evolution.
 * Substitua os valores de webhook conforme necessario no deploy real.
 */
const PRECONFIGURED_EVOLUTION_SLOTS: Record<
  string,
  {
    webhookUrl: string | null;
  }
> = {
  slot1: { webhookUrl: process.env.EVOLUTION_SLOT1_WEBHOOK_URL ?? null },
  slot2: { webhookUrl: process.env.EVOLUTION_SLOT2_WEBHOOK_URL ?? null },
  slot3: { webhookUrl: process.env.EVOLUTION_SLOT3_WEBHOOK_URL ?? null },
  slot4: { webhookUrl: process.env.EVOLUTION_SLOT4_WEBHOOK_URL ?? null }
};

interface EvolutionQrPayload {
  svg: string | null;
  base64: string | null;
  code?: string | null;
  status: string | null;
  pairingCode?: string | null;
  count?: number | null;
}

export interface EvolutionSessionResponse {
  instanceId: string;
  providerInstanceId?: string | null;
  profilePicUrl?: string | null;
  status: 'connected' | 'pending' | 'disconnected';
  qrCode?: EvolutionQrPayload | null;
  number?: string | null;
  name?: string | null;
  providerStatus?: string;
  message?: string | null;
  pairingCode?: string | null;
  slotId?: string | null;
}

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type EvolutionInstanceRecord = {
  id: string;
  userId: string;
  instanceId: string;
  providerInstanceId: string | null;
  status: string;
  connectedAt: Date | null;
  metadata: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class EvolutionIntegrationService {
  private readonly logger = new Logger(EvolutionIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolutionService: EvolutionService
  ) {}

  async createManagedInstance(
    userId: string,
    instanceName?: string,
    webhookUrl?: string,
    slotId?: string
  ): Promise<EvolutionSessionResponse> {
    const { resolvedWebhookUrl, resolvedSlotId } = await this.resolveAutoSlotConfiguration(userId);

    const effectiveInstanceName =
      (instanceName && instanceName.trim().length > 0)
        ? instanceName.trim()
        : this.buildUserInstanceName(userId);

    const existing = await this.findInstanceByDisplayName(userId, effectiveInstanceName);
    if (existing) {
      throw new BadRequestException('Instancia Evolution com esse nome ja existe.');
    }

    const payload = this.buildManagedInstancePayload(resolvedWebhookUrl);
    const created = await this.evolutionService.createInstance(effectiveInstanceName, payload);

    const summary = await this.evolutionService
      .fetchInstance(created.id, created.providerId ?? null)
      .catch(() => null);

    const providerInstanceId = summary?.id ?? created.providerId ?? null;
    const number = this.extractPhoneFromSummary(summary);
    const providerStatus = summary?.connectionStatus ?? 'created';

    const metadata: JsonObject = {
      displayName: effectiveInstanceName,
      slotId: resolvedSlotId ?? null,
      lastState: providerStatus,
      lastStatusAt: new Date().toISOString(),
      providerId: providerInstanceId,
      webhookUrl: resolvedWebhookUrl,
      number: number ?? null,
      token: created.token ?? null
    };

    await this.evolutionModel().create({
      data: {
        userId,
        instanceId: created.id,
        providerInstanceId,
        status: 'disconnected',
        metadata
      }
    });

    return {
      instanceId: created.id,
      status: 'disconnected',
      number,
      name: summary?.profileName ?? effectiveInstanceName,
      providerStatus,
      pairingCode: null,
      slotId: resolvedSlotId ?? null
    };
  }

  async registerExistingInstance(
    userId: string,
    instanceName: string,
    token: string
  ): Promise<EvolutionSessionResponse> {
    const summary = await this.evolutionService
      .fetchInstance(instanceName, token)
      .catch(() => null);

    if (!summary) {
      throw new NotFoundException('Instancia Evolution nao encontrada.');
    }

    const providerState = summary.connectionStatus ?? 'unknown';
    const status = this.mapStateToStatus(providerState);
    const number = this.extractPhoneFromSummary(summary);
    const providerInstanceId = summary.id ?? null;
    const resolvedInstanceId = summary.instanceName ?? summary.name ?? instanceName;

    const existingById = await this.evolutionModel().findFirst({
      where: { userId, instanceId: resolvedInstanceId }
    });

    const metadataPatch: JsonObject = {
      displayName: instanceName,
      lastState: providerState,
      lastStatusAt: new Date().toISOString(),
      providerId: providerInstanceId,
      number: number ?? null,
      token,
      profileName: summary.profileName ?? null,
      profilePicUrl: summary.profilePicUrl ?? null,
      ownerJid: summary.ownerJid ?? null
    };

    if (existingById) {
      const { resolvedWebhookUrl } = await this.resolveAutoSlotConfiguration(userId);
      const mergedMeta = this.mergeMetadata(existingById.metadata, { ...metadataPatch, webhookUrl: resolvedWebhookUrl });
      await this.updateInstance(existingById, {
        status,
        connectedAt: status === 'connected' ? existingById.connectedAt ?? new Date() : null,
        metadata: mergedMeta,
        providerInstanceId
      });
      await this.syncWebhookForInstance(userId, existingById.instanceId, resolvedWebhookUrl);

      return {
        instanceId: existingById.instanceId,
        status,
        number,
        name: summary.profileName ?? instanceName,
        providerStatus: providerState
      };
    }

    const existingGlobal = await this.evolutionModel().findFirst({
      where: { instanceId: resolvedInstanceId }
    });

    if (existingGlobal) {
      const { resolvedWebhookUrl } = await this.resolveAutoSlotConfiguration(userId);
      const mergedMeta = this.mergeMetadata(existingGlobal.metadata, { ...metadataPatch, webhookUrl: resolvedWebhookUrl });
      const updated = await (this.prisma as any).evolutionInstance.update({
        where: { id: existingGlobal.id },
        data: {
          userId,
          status,
          providerInstanceId,
          metadata: mergedMeta,
          connectedAt: status === 'connected' ? existingGlobal.connectedAt ?? new Date() : null
        }
      });
      await this.syncWebhookForInstance(userId, updated.instanceId, resolvedWebhookUrl);

      return {
        instanceId: updated.instanceId,
        status,
        number,
        name: summary.profileName ?? instanceName,
        providerStatus: providerState
      };
    }

    const { resolvedWebhookUrl } = await this.resolveAutoSlotConfiguration(userId);
    await this.evolutionModel().create({
      data: {
        userId,
        instanceId: resolvedInstanceId,
        providerInstanceId,
        status,
        metadata: { ...metadataPatch, webhookUrl: resolvedWebhookUrl }
      }
    });
    await this.syncWebhookForInstance(userId, resolvedInstanceId, resolvedWebhookUrl);

    return {
      instanceId: resolvedInstanceId,
      status,
      number,
      name: summary.profileName ?? instanceName,
      providerStatus: providerState
    };
  }

  async syncWebhook(userId: string, instanceKey: string) {
    const key = (instanceKey ?? '').trim();
    if (!key) {
      throw new BadRequestException('Instancia invalida.');
    }
    const record = await this.evolutionModel().findFirst({
      where: {
        userId,
        OR: [{ instanceId: key }, { providerInstanceId: key }]
      },
      select: { id: true, instanceId: true, providerInstanceId: true, metadata: true }
    });
    if (!record) {
      throw new NotFoundException('Instancia Evolution nao encontrada.');
    }
    const { resolvedWebhookUrl } = await this.resolveAutoSlotConfiguration(userId);
    const meta = this.asJsonObject(record.metadata);
    const webhookUrl = this.normalizeWebhookUrl(typeof meta.webhookUrl === 'string' ? meta.webhookUrl : resolvedWebhookUrl);
    await this.syncWebhookForInstance(userId, record.instanceId, webhookUrl);
    return { instanceId: record.instanceId, providerInstanceId: record.providerInstanceId ?? null, webhookUrl };
  }

  private asJsonObject(value: JsonValue | null | undefined): JsonObject {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as JsonObject;
    }
    return {};
  }

  private normalizeWebhookUrl(value: unknown): string {
    const s = typeof value === 'string' ? value.trim() : '';
    if (!s) return s;
    const stripped = s.replace(/^[`'"]+/, '').replace(/[`'"]+$/, '').trim();
    return stripped;
  }

  private readWebhookEvents(): string[] {
    const raw = (process.env.EVOLUTION_WEBHOOK_EVENTS ?? '').trim();
    const normalize = (v: string) => v.trim().toUpperCase().replace(/[.-]/g, '_');
    const parsed = raw
      ? raw
          .split(/[,\s]+/)
          .map(normalize)
          .filter(Boolean)
      : [];
    if (parsed.length) return Array.from(new Set(parsed));
    return [
      'MESSAGES_UPSERT',
      'MESSAGES_UPDATE',
      'CONNECTION_UPDATE',
      'CHATS_UPSERT',
      'CHATS_UPDATE',
      'CONTACTS_UPSERT',
      'CONTACTS_UPDATE'
    ];
  }

  private readWebhookByEvents(): boolean {
    return (process.env.EVOLUTION_WEBHOOK_BY_EVENTS ?? 'true').toLowerCase() !== 'false';
  }

  private readWebhookBase64(): boolean {
    return (process.env.EVOLUTION_WEBHOOK_BASE64 ?? 'true').toLowerCase() !== 'false';
  }

  private async syncWebhookForInstance(userId: string, instanceId: string, webhookUrl: string) {
    const headers: Record<string, string> = {};
    const webhookAuthorization = process.env.EVOLUTION_WEBHOOK_AUTHORIZATION;
    if (webhookAuthorization && webhookAuthorization.length > 0) {
      headers.authorization = webhookAuthorization;
    }
    const webhookToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    if (webhookToken && webhookToken.length > 0) {
      headers['x-evolution-webhook-token'] = webhookToken;
    }
    headers['Content-Type'] = process.env.EVOLUTION_WEBHOOK_CONTENT_TYPE ?? 'application/json';
    const byEvents = this.readWebhookByEvents();
    const base64 = this.readWebhookBase64();
    const desiredEvents = this.readWebhookEvents();
    const eventAttempts: string[][] = [
      desiredEvents,
      desiredEvents.filter((e) => e.startsWith('MESSAGES_') || e === 'CONNECTION_UPDATE'),
      ['MESSAGES_UPSERT']
    ].filter((arr) => arr.length > 0);

    let lastError: unknown = null;
    for (const events of eventAttempts) {
      for (const by of [byEvents, false]) {
        try {
          await this.evolutionService.setWebhook({
            instanceId,
            url: webhookUrl,
            enabled: true,
            byEvents: by,
            base64,
            headers,
            events
          });
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (!lastError) break;
    }
    if (lastError) {
      throw lastError;
    }
    const nowIso = new Date().toISOString();
    const existing = await this.evolutionModel().findFirst({ where: { userId, instanceId }, select: { id: true, metadata: true } });
    if (!existing) {
      throw new NotFoundException('Instancia Evolution nao encontrada para sincronizar webhook.');
    }
    const meta = this.asJsonObject(existing.metadata);
    const patched = {
      ...meta,
      webhookUrl,
      lastWebhookSyncAt: nowIso
    };
    await this.evolutionModel().update({ where: { id: existing.id }, data: { metadata: patched } });
  }

  private resolveSlotConfiguration(
    slotId?: string,
    webhookUrl?: string
  ): { resolvedWebhookUrl: string; resolvedSlotId: string | null } {
    const normalizedSlotId = slotId?.trim();
    const normalizedWebhookUrl = webhookUrl?.trim();

    if (normalizedSlotId && normalizedSlotId.length > 0) {
      const slotConfig = PRECONFIGURED_EVOLUTION_SLOTS[normalizedSlotId];

      if (!slotConfig) {
        throw new BadRequestException('Slot Evolution selecionado e invalido.');
      }

      const slotWebhook = slotConfig.webhookUrl?.trim() ?? null;
      const resolvedWebhookUrl = normalizedWebhookUrl && normalizedWebhookUrl.length > 0 ? normalizedWebhookUrl : slotWebhook;

      if (!resolvedWebhookUrl) {
        throw new BadRequestException('Slot Evolution selecionado nao possui webhook configurado.');
      }

      return { resolvedWebhookUrl, resolvedSlotId: normalizedSlotId };
    }

    if (normalizedWebhookUrl && normalizedWebhookUrl.length > 0) {
      return { resolvedWebhookUrl: normalizedWebhookUrl, resolvedSlotId: null };
    }

    throw new BadRequestException(
      'Informe um webhook valido ou selecione um slot Evolution pre-configurado.'
    );
  }

  private async resolveAutoSlotConfiguration(
    userId: string
  ): Promise<{ resolvedWebhookUrl: string; resolvedSlotId: string | null }> {
    const usedSlots = new Set<string>();
    const existing = await this.evolutionModel().findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    });
    for (const record of existing) {
      const slot = this.extractSlotIdFromMetadata(record.metadata);
      if (slot) {
        usedSlots.add(slot);
      }
    }

    for (const key of Object.keys(PRECONFIGURED_EVOLUTION_SLOTS)) {
      if (!usedSlots.has(key)) {
        const webhook = PRECONFIGURED_EVOLUTION_SLOTS[key]?.webhookUrl?.trim();
        if (webhook && webhook.length > 0) {
          return { resolvedWebhookUrl: webhook, resolvedSlotId: key };
        }
      }
    }

    const backendBase = process.env.BACKEND_PUBLIC_URL?.trim();
    if (backendBase && backendBase.length > 0) {
      const normalized = backendBase.replace(/\/$/, '');
      const url = `${normalized}/api/webhooks/evolution`;
      return { resolvedWebhookUrl: url, resolvedSlotId: null };
    }

    throw new BadRequestException(
      'Nao ha slots Evolution disponiveis e BACKEND_PUBLIC_URL nao esta configurado.'
    );
  }

  async listManagedInstances(userId: string): Promise<EvolutionSessionResponse[]> {
    const records = await this.evolutionModel().findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    });

    if (!records.length) {
      return [];
    }

    const sessions = await Promise.all(
      records.map(async (record) => {
        try {
          return await this.getStatus(userId, record.instanceId);
        } catch (error) {
          this.logger.warn(
            `Falha ao atualizar status da instancia Evolution ${record.instanceId}: ${error}`
          );

          return {
            instanceId: record.instanceId,
            providerInstanceId: this.resolveProviderInstanceId(record),
            status: 'disconnected',
            number: this.extractPhoneFromMetadata(record.metadata),
            name: this.extractNameFromMetadata(record.metadata),
            profilePicUrl: this.extractProfilePicFromMetadata(record.metadata),
            providerStatus: 'unknown',
            pairingCode: this.extractPairingCodeFromMetadata(record.metadata),
            qrCode: this.readQrFromMetadata(record.metadata)
          };
        }
      })
    );

    return sessions.filter(
      (session): session is EvolutionSessionResponse => session !== null && session !== undefined
    );
  }

  async startSession(userId: string, phoneNumber?: string): Promise<EvolutionSessionResponse> {
    const current = await this.findLatestInstance(userId);

    if (current) {
      const providerInstanceId = this.resolveProviderInstanceId(current);
      const [state, summary] = await Promise.all([
        this.safeGetState(current.instanceId),
        this.evolutionService.fetchInstance(current.instanceId, providerInstanceId).catch(() => null)
      ]);

      if (state || summary) {
        const providerState =
          state?.instance?.state ?? state?.status ?? summary?.connectionStatus ?? 'unknown';
        const status = this.mapStateToStatus(providerState);
        const summaryNumber = this.extractPhoneFromSummary(summary);

        const requestedNumber =
          phoneNumber ??
          summaryNumber ??
          this.extractRequestedNumberFromMetadata(current.metadata) ??
          this.extractPhoneFromMetadata(current.metadata);

        const metadataPatch: JsonObject = {
          lastState: providerState,
          connectionStatus: summary?.connectionStatus ?? null,
          ownerJid: summary?.ownerJid ?? null,
          profileName: summary?.profileName ?? null,
          profilePicUrl: summary?.profilePicUrl ?? null,
          number: requestedNumber ?? null,
          requestedNumber: requestedNumber ?? null,
          providerId: summary?.id ?? providerInstanceId ?? null,
          lastStatusAt: new Date().toISOString()
        };

        if (status === 'connected') {
          await this.safeLogout(current.instanceId);

          const qr = await this.fetchQr(
            current,
            summary?.id ?? providerInstanceId ?? null,
            requestedNumber ?? null
          );

          metadataPatch.lastPairingCode = qr.pairingCode ?? null;
          metadataPatch.lastQrCode = qr.code ?? null;
          metadataPatch.lastQrCount = typeof qr.count === 'number' ? qr.count : null;

          await this.updateInstance(current, {
            status: 'pending',
            connectedAt: null,
            metadata: metadataPatch,
            providerInstanceId: summary?.id ?? providerInstanceId ?? null
          });

          return {
            instanceId: current.instanceId,
            status: 'pending',
            qrCode: qr,
            number: requestedNumber ?? null,
            name: summary?.profileName ?? this.extractNameFromMetadata(current.metadata),
            providerStatus: providerState,
            message: state?.message ?? null,
            pairingCode: qr.pairingCode ?? this.extractPairingCodeFromMetadata(current.metadata)
          };
        }

        const qr = await this.fetchQr(
          current,
          summary?.id ?? providerInstanceId ?? null,
          requestedNumber ?? null
        );

        metadataPatch.lastPairingCode = qr.pairingCode ?? null;
        metadataPatch.lastQrCode = qr.code ?? null;
        metadataPatch.lastQrCount = typeof qr.count === 'number' ? qr.count : null;

        await this.updateInstance(current, {
          status: 'pending',
          connectedAt: null,
          metadata: metadataPatch,
          providerInstanceId: summary?.id ?? providerInstanceId ?? null
        });

        return {
          instanceId: current.instanceId,
          status: 'pending',
          qrCode: qr,
          number: requestedNumber ?? null,
          name: summary?.profileName ?? this.extractNameFromMetadata(current.metadata),
          providerStatus: providerState,
          message: state?.message ?? null,
          pairingCode: qr.pairingCode ?? this.extractPairingCodeFromMetadata(current.metadata)
        };
      } else {
        // Instance no longer exists on provider. Keep record disconnected to allow fresh creation.
        await this.updateInstance(current, {
          status: 'disconnected',
          connectedAt: null,
          metadata: {
            lastState: 'unknown',
            lastStatusAt: new Date().toISOString()
          } as JsonObject
        });
      }
    }

    return this.createFreshSession(userId, phoneNumber);
  }

  async refreshQr(userId: string, instanceId: string, phoneNumber?: string): Promise<EvolutionSessionResponse> {
    const instance = await this.getOwnedInstance(userId, instanceId);
    const providerInstanceId = this.resolveProviderInstanceId(instance);
    const [state, summary] = await Promise.all([
      this.safeGetState(instanceId),
      this.evolutionService.fetchInstance(instanceId, providerInstanceId).catch(() => null)
    ]);
    const providerState =
      state?.instance?.state ?? state?.status ?? summary?.connectionStatus ?? 'unknown';
    const summaryNumber = this.extractPhoneFromSummary(summary);

    if (providerState === 'connected' || providerState === 'open' || providerState === 'pending') {
      await this.safeLogout(instanceId);
    }

    const metadataPatch: JsonObject = {
      lastState: providerState,
      providerId: summary?.id ?? providerInstanceId ?? null,
      lastStatusAt: new Date().toISOString()
    };
    if (summaryNumber) {
      metadataPatch.number = summaryNumber;
    }
    if (summary?.connectionStatus) metadataPatch.connectionStatus = summary.connectionStatus;
    if (summary?.ownerJid) metadataPatch.ownerJid = summary.ownerJid;
    if (summary?.profileName) metadataPatch.profileName = summary.profileName;
    if (summary?.profilePicUrl) metadataPatch.profilePicUrl = summary.profilePicUrl;

    const qr = await this.fetchQr(instance, summary?.id ?? providerInstanceId ?? null, phoneNumber ?? summaryNumber ?? null);

    await this.updateInstance(instance, {
      status: 'pending',
      connectedAt: null,
      metadata: metadataPatch,
      providerInstanceId: summary?.id ?? providerInstanceId ?? null
    });

    return {
      instanceId,
      status: 'pending',
      qrCode: qr,
      number: summaryNumber ?? this.extractPhoneFromMetadata(instance.metadata),
      name: summary?.profileName ?? this.extractNameFromMetadata(instance.metadata),
      profilePicUrl: summary?.profilePicUrl ?? this.extractProfilePicFromMetadata(instance.metadata),
      providerStatus: providerState
    };
  }

  async getStatus(userId: string, instanceId: string): Promise<EvolutionSessionResponse> {
    const instance = await this.getOwnedInstance(userId, instanceId);
    const providerInstanceId = this.resolveProviderInstanceId(instance);
    const [state, summary] = await Promise.all([
      this.evolutionService.getState(instanceId),
      this.evolutionService.fetchInstance(instanceId, providerInstanceId).catch(() => null)
    ]);

    const providerState =
      state.instance?.state ?? state.status ?? summary?.connectionStatus ?? 'unknown';
    const status = this.mapStateToStatus(providerState);
    const storedQr = this.readQrFromMetadata(instance.metadata);
    const summaryNumber = this.extractPhoneFromSummary(summary);
    const connectedAt =
      status === 'connected'
        ? instance.connectedAt ?? new Date()
        : status === 'disconnected'
          ? null
          : instance.connectedAt ?? null;

    let qrCode: EvolutionQrPayload | null = null;

    if (status === 'pending') {
      qrCode = storedQr ?? (await this.fetchQr(instance, summary?.id ?? providerInstanceId ?? null));
    }

    await this.updateInstance(instance, {
      status,
      connectedAt,
      metadata: {
        lastState: providerState,
        ...(summary?.connectionStatus ? { connectionStatus: summary.connectionStatus } : {}),
        ...(summary?.ownerJid ? { ownerJid: summary.ownerJid } : {}),
        ...(summary?.profileName ? { profileName: summary.profileName } : {}),
        ...(summary?.profilePicUrl ? { profilePicUrl: summary.profilePicUrl } : {}),
        ...(summaryNumber ? { number: summaryNumber } : {}),
        providerId: summary?.id ?? providerInstanceId ?? null,
        lastStatusAt: new Date().toISOString()
      } as JsonObject
    });

    return {
      instanceId,
      providerInstanceId: summary?.id ?? providerInstanceId ?? null,
      status,
      number: summaryNumber ?? this.extractPhoneFromMetadata(instance.metadata),
      name: summary?.profileName ?? this.extractNameFromMetadata(instance.metadata),
      profilePicUrl: summary?.profilePicUrl ?? this.extractProfilePicFromMetadata(instance.metadata),
      qrCode,
      providerStatus: providerState,
      message: state.message ?? null,
      pairingCode: this.extractPairingCodeFromMetadata(instance.metadata)
    };
  }

  async disconnect(userId: string, instanceId: string): Promise<EvolutionSessionResponse> {
    const instance = await this.getOwnedInstance(userId, instanceId);

    await this.safeLogout(instanceId);

    await this.updateInstance(instance, {
      status: 'disconnected',
      connectedAt: null,
      metadata: {
        lastState: 'disconnected',
        lastStatusAt: new Date().toISOString()
      } as JsonObject
    });

  return {
    instanceId,
    status: 'disconnected',
    pairingCode: null
  };
  }

  async removeInstance(userId: string, instanceId: string): Promise<EvolutionSessionResponse> {
    const instance = await this.getOwnedInstance(userId, instanceId);

    await this.safeLogout(instanceId);

    try {
      await this.evolutionService.delete(instanceId);
    } catch (error) {
      if (!(error instanceof HttpException && error.getStatus() === 404)) {
        throw error;
      }
    }

    await this.evolutionModel().delete({
      where: { id: instance.id }
    });

  return {
    instanceId,
    status: 'disconnected',
    pairingCode: null
  };
  }

  async detachInstance(userId: string, instanceId: string): Promise<EvolutionSessionResponse> {
    const instance = await this.getOwnedInstance(userId, instanceId);

    await this.evolutionModel().delete({
      where: { id: instance.id }
    });

    return {
      instanceId,
      status: 'disconnected',
      pairingCode: null
    };
  }

  async getCurrentSession(userId: string): Promise<EvolutionSessionResponse | null> {
    const current = await this.findLatestInstance(userId);

    if (!current) {
      return null;
    }

    const providerInstanceId = this.resolveProviderInstanceId(current);
    const [state, summary] = await Promise.all([
      this.safeGetState(current.instanceId),
      this.evolutionService.fetchInstance(current.instanceId, providerInstanceId).catch(() => null)
    ]);

    const storedQr = this.readQrFromMetadata(current.metadata);

    if (!state && !summary) {
      await this.updateInstance(current, {
        status: 'disconnected',
        connectedAt: null,
        metadata: {
          lastState: 'unknown',
          lastStatusAt: new Date().toISOString()
        } as JsonObject,
        providerInstanceId: null
      });

      return {
        instanceId: current.instanceId,
        status: 'disconnected',
        qrCode: storedQr,
      };
    }

    const providerState =
      state?.instance?.state ?? state?.status ?? summary?.connectionStatus ?? 'unknown';
    const status = this.mapStateToStatus(providerState);
    const summaryNumber = this.extractPhoneFromSummary(summary);
    const requestedNumber =
      this.extractRequestedNumberFromMetadata(current.metadata) ?? summaryNumber ?? null;

    const metadataPatch: JsonObject = {
      lastState: providerState,
      connectionStatus: summary?.connectionStatus ?? null,
      ownerJid: summary?.ownerJid ?? null,
      profileName: summary?.profileName ?? null,
      profilePicUrl: summary?.profilePicUrl ?? null,
      number: summaryNumber ?? requestedNumber ?? null,
      requestedNumber,
      providerId: summary?.id ?? providerInstanceId ?? null,
      lastStatusAt: new Date().toISOString()
    };

    if (status === 'connected') {
      await this.updateInstance(current, {
        status: 'connected',
        connectedAt: current.connectedAt ?? new Date(),
        metadata: metadataPatch,
        providerInstanceId: summary?.id ?? providerInstanceId ?? null
      });

      return {
        instanceId: current.instanceId,
        status: 'connected',
        qrCode: storedQr,
        number: summaryNumber ?? this.extractPhoneFromMetadata(current.metadata) ?? requestedNumber,
        name: summary?.profileName ?? this.extractNameFromMetadata(current.metadata),
        providerStatus: providerState,
        pairingCode: this.extractPairingCodeFromMetadata(current.metadata)
      };
    }

    if (status === 'pending') {
      const qrPayload =
        storedQr ??
        (await this.fetchQr(
          current,
          summary?.id ?? providerInstanceId ?? null,
          requestedNumber ?? summaryNumber ?? null
        ));

      metadataPatch.lastPairingCode = qrPayload?.pairingCode ?? null;
      metadataPatch.lastQrCode = qrPayload?.code ?? null;
      metadataPatch.lastQrCount =
        typeof qrPayload?.count === 'number' ? qrPayload.count : null;
      metadataPatch.requestedNumber = requestedNumber ?? summaryNumber ?? null;

      await this.updateInstance(current, {
        status: 'pending',
        connectedAt: null,
        metadata: metadataPatch,
        providerInstanceId: summary?.id ?? providerInstanceId ?? null
      });

      return {
        instanceId: current.instanceId,
        status: 'pending',
        qrCode: qrPayload,
        number:
          requestedNumber ?? summaryNumber ?? this.extractPhoneFromMetadata(current.metadata),
        name: summary?.profileName ?? this.extractNameFromMetadata(current.metadata),
        providerStatus: providerState,
        message: state?.message ?? null,
        pairingCode: qrPayload?.pairingCode ?? this.extractPairingCodeFromMetadata(current.metadata)
      };
    }

    await this.updateInstance(current, {
      status: 'disconnected',
      connectedAt: null,
      metadata: metadataPatch,
      providerInstanceId: summary?.id ?? providerInstanceId ?? null
    });

    return {
      instanceId: current.instanceId,
      status: 'disconnected',
      qrCode: storedQr,
      number: summaryNumber ?? this.extractPhoneFromMetadata(current.metadata) ?? requestedNumber,
      name: summary?.profileName ?? this.extractNameFromMetadata(current.metadata),
      providerStatus: providerState,
      message: state?.message ?? null,
      pairingCode: this.extractPairingCodeFromMetadata(current.metadata)
    };
  }

  private async findLatestInstance(userId: string) {
    return this.evolutionModel().findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  private async createFreshSession(
    userId: string,
    phoneNumber?: string
  ): Promise<EvolutionSessionResponse> {
    const instanceAlias = this.buildUserInstanceName(userId);
    const created = await this.evolutionService.createInstance(instanceAlias);
    const qrPayload = await this.evolutionService.getQrCode(created.id, phoneNumber ?? undefined);
    const summary = await this.evolutionService
      .fetchInstance(created.id, created.providerId ?? null)
      .catch(() => null);

    const base64 = typeof qrPayload.base64 === 'string' ? qrPayload.base64 : null;
    const svg = qrPayload.qrCode ?? null;
    const status = qrPayload.status ?? null;
    const pairingCode = qrPayload.pairingCode ?? null;
    const code = typeof qrPayload.code === 'string' ? qrPayload.code : null;
    const count = typeof qrPayload.count === 'number' ? qrPayload.count : null;
    const summaryNumber = this.extractPhoneFromSummary(summary) ?? phoneNumber ?? null;
    const providerInstanceId = summary?.id ?? created.providerId ?? null;

    const metadata: JsonObject = {
      displayName: created.name ?? instanceAlias,
      lastQrSvg: svg,
      lastQrBase64: base64,
      lastQrCode: code,
      lastQrStatus: status,
      lastPairingCode: pairingCode,
      lastQrCount: count,
      lastQrAt: new Date().toISOString(),
      providerId: providerInstanceId,
      token: created.token ?? null,
      rawInstance: created.raw ? (created.raw as JsonObject) : null,
      connectionStatus: summary?.connectionStatus ?? null,
      ownerJid: summary?.ownerJid ?? null,
      profileName: summary?.profileName ?? null,
      profilePicUrl: summary?.profilePicUrl ?? null,
      number: summaryNumber,
      requestedNumber: phoneNumber ?? summaryNumber
    };

    await this.evolutionModel().create({
      data: {
        userId,
        instanceId: created.id,
        providerInstanceId,
        status: 'pending',
        metadata
      }
    });

    return {
      instanceId: created.id,
      status: 'pending',
      qrCode: {
        svg,
        base64,
        code,
        status,
        pairingCode,
        count
      },
      number: summaryNumber,
      name: summary?.profileName ?? created.name ?? null,
      pairingCode: pairingCode ?? null
    };
  }

  private async fetchQr(
    instance: EvolutionInstanceRecord,
    providerInstanceId?: string | null,
    phoneNumber?: string | null
  ): Promise<EvolutionQrPayload> {
    const qrPayload = await this.evolutionService.getQrCode(
      instance.instanceId,
      phoneNumber ?? undefined
    );

    const base64 = typeof qrPayload.base64 === 'string' ? qrPayload.base64 : null;
    const svg = qrPayload.qrCode ?? null;
    const status = qrPayload.status ?? null;
    const pairingCode = qrPayload.pairingCode ?? null;
    const code = typeof qrPayload.code === 'string' ? qrPayload.code : null;
    const count = typeof qrPayload.count === 'number' ? qrPayload.count : null;

    await this.updateInstance(instance, {
      status: 'pending',
      metadata: {
        lastQrSvg: svg,
        lastQrBase64: base64,
        lastQrCode: code,
        lastQrStatus: status,
        lastPairingCode: pairingCode,
        lastQrCount: count,
        requestedNumber: phoneNumber ?? this.extractRequestedNumberFromMetadata(instance.metadata) ?? null,
        lastQrAt: new Date().toISOString()
      } as JsonObject,
      providerInstanceId: providerInstanceId ?? this.resolveProviderInstanceId(instance)
    });

    return {
      svg,
      base64,
      code,
      status,
      pairingCode,
      count
    };
  }

  private async findInstanceByDisplayName(
    userId: string,
    displayName: string
  ): Promise<EvolutionInstanceRecord | null> {
    const record = await this.evolutionModel().findFirst({
      where: {
        userId,
        metadata: {
          path: ['displayName'],
          equals: displayName
        }
      }
    });

    return record as EvolutionInstanceRecord | null;
  }

  private buildManagedInstancePayload(webhookUrl: string): Record<string, unknown> {
    const headers: Record<string, string> = {};
    const webhookAuthorization = process.env.EVOLUTION_WEBHOOK_AUTHORIZATION;
    if (webhookAuthorization && webhookAuthorization.length > 0) {
      headers.authorization = webhookAuthorization;
    }
    const webhookToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    if (webhookToken && webhookToken.length > 0) {
      headers['x-evolution-webhook-token'] = webhookToken;
    }

    headers['Content-Type'] = process.env.EVOLUTION_WEBHOOK_CONTENT_TYPE ?? 'application/json';

    const byEvents = this.readWebhookByEvents();
    const base64 = this.readWebhookBase64();
    const events = this.readWebhookEvents();

    return {
      integration: 'WHATSAPP-BAILEYS',
      groupsIgnore: true,
      webhook: {
        url: webhookUrl,
        byEvents,
        base64,
        headers,
        events
      }
    };
  }

  private buildUserInstanceName(userId: string): string {
    const unique = Math.random().toString(36).slice(2, 10);
    return `${userId}-${unique}`;
  }

  private async safeGetState(instanceId: string) {
    try {
      return await this.evolutionService.getState(instanceId);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) {
        this.logger.warn(`Evolution instance ${instanceId} was not found on provider.`);
        return null;
      }

      throw error;
    }
  }

  private async getOwnedInstance(
    userId: string,
    instanceId: string
  ): Promise<EvolutionInstanceRecord> {
    const instance = await this.evolutionModel().findUnique({
      where: { instanceId }
    });

    if (!instance || instance.userId !== userId) {
      throw new NotFoundException('Evolution instance not found.');
    }

    return instance as EvolutionInstanceRecord;
  }

  private async updateInstance(
    instance: EvolutionInstanceRecord,
    payload: {
      status?: string;
      connectedAt?: Date | null;
      metadata?: JsonObject;
      providerInstanceId?: string | null;
    }
  ) {
    const { status, connectedAt, metadata, providerInstanceId } = payload;

    await this.evolutionModel().update({
      where: { id: instance.id },
      data: {
        ...(status ? { status } : {}),
        ...(connectedAt !== undefined ? { connectedAt } : {}),
        ...(metadata
          ? { metadata: this.mergeMetadata(instance.metadata, metadata) }
          : {})
      }
    });
  }

  private mergeMetadata(
    current: JsonValue | null,
    patch: JsonObject
  ): JsonObject {
    const base: JsonObject =
      current && typeof current === 'object' && !Array.isArray(current)
        ? { ...(current as JsonObject) }
        : {};

    return {
      ...base,
      ...patch
    };
  }

  private readQrFromMetadata(metadata: JsonValue | null): EvolutionQrPayload | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const record = metadata as JsonObject;
    const base64Raw = record['lastQrBase64'];
    const svgRaw = record['lastQrSvg'];
    const statusRaw = record['lastQrStatus'];
    const codeRaw = record['lastQrCode'];
    const pairingRaw = record['lastPairingCode'];
    const countRaw = record['lastQrCount'];

    const base64Value =
      typeof base64Raw === 'string' && base64Raw.length > 0 ? (base64Raw as string) : null;
    const svgValue =
      typeof svgRaw === 'string' && svgRaw.length > 0 ? (svgRaw as string) : null;
    const statusValue =
      typeof statusRaw === 'string' && statusRaw.length > 0 ? (statusRaw as string) : 'pending';
    const codeValue =
      typeof codeRaw === 'string' && codeRaw.length > 0 ? (codeRaw as string) : null;
    const pairingCodeValue =
      typeof pairingRaw === 'string' && pairingRaw.length > 0 ? (pairingRaw as string) : null;
    let countValue: number | null = null;

    if (typeof countRaw === 'number') {
      countValue = countRaw;
    } else if (typeof countRaw === 'string') {
      const parsed = Number(countRaw);
      countValue = Number.isFinite(parsed) ? parsed : null;
    }

    if (!base64Value && !svgValue && !codeValue) {
      return null;
    }

    return {
      base64: base64Value,
      svg: svgValue,
      code: codeValue,
      status: statusValue,
      pairingCode: pairingCodeValue,
      count: countValue
    };
  }

  private evolutionModel() {
    return (this.prisma as any).evolutionInstance as {
      findFirst: (...args: any[]) => Promise<EvolutionInstanceRecord | null>;
      findMany: (...args: any[]) => Promise<EvolutionInstanceRecord[]>;
      create: (...args: any[]) => Promise<EvolutionInstanceRecord>;
      findUnique: (...args: any[]) => Promise<EvolutionInstanceRecord | null>;
      update: (...args: any[]) => Promise<EvolutionInstanceRecord>;
      delete: (...args: any[]) => Promise<EvolutionInstanceRecord>;
    };
  }

  private async safeLogout(instanceId: string) {
    try {
      await this.evolutionService.logout(instanceId);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) {
        return;
      }
      this.logger.warn(`Failed to logout Evolution instance ${instanceId}: ${error}`);
    }
  }

  private resolveProviderInstanceId(instance: EvolutionInstanceRecord): string | null {
    return instance.providerInstanceId ?? this.extractProviderIdFromMetadata(instance.metadata);
  }

  private extractProviderIdFromMetadata(metadata: JsonValue | null): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const record = metadata as JsonObject;
    const providerId = record['providerId'] ?? record['providerInstanceId'];

    return typeof providerId === 'string' && providerId.length > 0 ? providerId : null;
  }

  private extractRequestedNumberFromMetadata(metadata: JsonValue | null): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const record = metadata as JsonObject;
    const requested = record['requestedNumber'] ?? record['number'];

    return typeof requested === 'string' && requested.length > 0 ? requested : null;
  }

  private extractPairingCodeFromMetadata(metadata: JsonValue | null): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const record = metadata as JsonObject;
    const pairing = record['lastPairingCode'];

    return typeof pairing === 'string' && pairing.length > 0 ? pairing : null;
  }

  private extractPhoneFromSummary(summary: EvolutionInstanceSummary | null): string | null {
    if (!summary) {
      return null;
    }

    if (summary.number) {
      return summary.number;
    }

    if (summary.ownerJid) {
      return summary.ownerJid.replace('@s.whatsapp.net', '');
    }

    return null;
  }

  private extractPhoneFromMetadata(metadata: JsonValue | null): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const record = metadata as JsonObject;
    const phone = record['number'];
    const owner = record['ownerJid'];

    if (typeof phone === 'string' && phone.length > 0) {
      return phone;
    }

    if (typeof owner === 'string' && owner.length > 0) {
      return owner.replace('@s.whatsapp.net', '');
    }

    return null;
  }

  private extractNameFromMetadata(metadata: JsonValue | null): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const record = metadata as JsonObject;
    const name = record['profileName'] ?? record['name'] ?? record['displayName'];

    return typeof name === 'string' && name.length > 0 ? name : null;
  }

  private extractProfilePicFromMetadata(metadata: JsonValue | null): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }
    const record = metadata as JsonObject;
    const url = record['profilePicUrl'];
    return typeof url === 'string' && url.length > 0 ? url : null;
  }

  private extractSlotIdFromMetadata(metadata: JsonValue | null): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }
    const record = metadata as JsonObject;
    const slotId = record['slotId'];
    return typeof slotId === 'string' && slotId.length > 0 ? slotId : null;
  }

  private mapStateToStatus(state: string): 'connected' | 'pending' | 'disconnected' {
    const normalized = state.toLowerCase();

    if (['connected', 'open', 'online', 'ready'].some((value) => normalized.includes(value))) {
      return 'connected';
    }

    if (['connecting', 'pairing', 'initializing', 'pending'].some((value) => normalized.includes(value))) {
      return 'pending';
    }

    return 'disconnected';
  }

  // private buildInstanceName(userId: string): string {
  //   const suffix = userId.slice(-6);
  //   return `clinic-${suffix}`;
  // }

  async findInstanceOwner(query: {
    instanceId?: string;
    providerInstanceId?: string;
    phoneNumber?: string;
  }): Promise<{ userId: string; instanceId: string; providerInstanceId: string | null } | null> {
    const orConditions: Prisma.EvolutionInstanceWhereInput[] = [];

    if (query.instanceId) {
      orConditions.push({ instanceId: query.instanceId });
    }

    if (query.providerInstanceId) {
      orConditions.push({ providerInstanceId: query.providerInstanceId });
    }

    if (query.phoneNumber) {
      orConditions.push({
        metadata: { path: ['number'], equals: query.phoneNumber }
      });
    }

    if (!orConditions.length) {
      return null;
    }

    const record = await this.evolutionModel().findFirst({
      where: { OR: orConditions },
      orderBy: { updatedAt: 'desc' }
    });

    if (!record) {
      return null;
    }

    return {
      userId: record.userId,
      instanceId: record.instanceId,
      providerInstanceId: record.providerInstanceId
    };
  }
}
