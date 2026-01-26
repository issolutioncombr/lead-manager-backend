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
    webhookUrl: string;
  }
> = {
  slot1: { webhookUrl: 'https://example.com/webhook/slot1' },
  slot2: { webhookUrl: 'https://example.com/webhook/slot2' },
  slot3: { webhookUrl: 'https://example.com/webhook/slot3' },
  slot4: { webhookUrl: 'https://example.com/webhook/slot4' }
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
    instanceName: string,
    webhookUrl?: string,
    slotId?: string
  ): Promise<EvolutionSessionResponse> {
    const { resolvedWebhookUrl, resolvedSlotId } = this.resolveSlotConfiguration(slotId, webhookUrl);

    if (resolvedSlotId) {
      const slotInUse = await this.evolutionModel().findFirst({
        where: {
          userId,
          metadata: {
            path: ['slotId'],
            equals: resolvedSlotId
          }
        }
      });

      if (slotInUse) {
        throw new BadRequestException('Slot Evolution selecionado ja possui uma instancia criada.');
      }
    }

    const existing = await this.findInstanceByDisplayName(userId, instanceName);
    if (existing) {
      throw new BadRequestException('Instancia Evolution com esse nome ja existe.');
    }

    const payload = this.buildManagedInstancePayload(resolvedWebhookUrl);
    const created = await this.evolutionService.createInstance(instanceName, payload);

    const summary = await this.evolutionService
      .fetchInstance(created.id, created.providerId ?? null)
      .catch(() => null);

    const providerInstanceId = summary?.id ?? created.providerId ?? null;
    const number = this.extractPhoneFromSummary(summary);
    const providerStatus = summary?.connectionStatus ?? 'created';

    const metadata: JsonObject = {
      displayName: instanceName,
      slotId: resolvedSlotId ?? null,
      lastState: providerStatus,
      lastStatusAt: new Date().toISOString(),
      providerId: providerInstanceId,
      webhookUrl: resolvedWebhookUrl,
      number: number ?? null
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
      name: summary?.profileName ?? instanceName,
      providerStatus,
      pairingCode: null,
      slotId: resolvedSlotId ?? null
    };
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
            status: 'disconnected',
            number: this.extractPhoneFromMetadata(record.metadata),
            name: this.extractNameFromMetadata(record.metadata),
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
      connectionStatus: summary?.connectionStatus ?? null,
      ownerJid: summary?.ownerJid ?? null,
      profileName: summary?.profileName ?? null,
      profilePicUrl: summary?.profilePicUrl ?? null,
      number: summaryNumber ?? null,
      providerId: summary?.id ?? providerInstanceId ?? null,
      lastStatusAt: new Date().toISOString()
    };

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
        connectionStatus: summary?.connectionStatus ?? null,
        ownerJid: summary?.ownerJid ?? null,
        profileName: summary?.profileName ?? null,
        profilePicUrl: summary?.profilePicUrl ?? null,
        number: summaryNumber ?? null,
        providerId: summary?.id ?? providerInstanceId ?? null,
        lastStatusAt: new Date().toISOString()
      } as JsonObject
    });

  return {
    instanceId,
    status,
    number: summaryNumber ?? this.extractPhoneFromMetadata(instance.metadata),
    name: summary?.profileName ?? this.extractNameFromMetadata(instance.metadata),
    qrCode,
    providerStatus: providerState,
    message: state.message ?? null,
    pairingCode: this.extractPairingCodeFromMetadata(instance.metadata)
  };
  }

  async disconnect(userId: string, instanceId: string): Promise<EvolutionSessionResponse> {
    const instance = await this.getOwnedInstance(userId, instanceId);

    try {
      await this.evolutionService.logout(instanceId);
    } catch (error) {
      if (!(error instanceof HttpException && error.getStatus() === 404)) {
        throw error;
      }

      this.logger.warn(`Evolution instance ${instanceId} already missing on provider.`);
    }

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
    const instanceAlias = this.buildInstanceName(userId);
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

    headers['Content-Type'] = process.env.EVOLUTION_WEBHOOK_CONTENT_TYPE ?? 'application/json';

    return {
      integration: 'WHATSAPP-BAILEYS',
      groupsIgnore: true,
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: true,
        headers,
        events: ['MESSAGES_UPSERT']
      }
    };
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

  private buildInstanceName(userId: string): string {
    const suffix = userId.slice(-6);
    return `clinic-${suffix}`;
  }

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

