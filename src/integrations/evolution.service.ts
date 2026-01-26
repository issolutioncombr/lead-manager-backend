import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CreateInstanceResponse {
  instance?: Record<string, unknown>;
  message?: string;
}

export interface EvolutionCreatedInstance {
  id: string;
  name?: string;
  providerId?: string;
  token?: string;
  raw?: Record<string, unknown>;
}

interface QrCodeResponse {
  qrCode?: string;
  base64?: string;
  status?: string;
  pairingCode?: string;
  code?: string;
  count?: number;
}

interface InstanceStateResponse {
  instance?: {
    instanceName: string;
    state: string;
  };
  status?: string;
  message?: string;
}

export interface EvolutionInstanceSummary {
  id: string;
  name: string;
  instanceName?: string;
  connectionStatus?: string | null;
  ownerJid?: string | null;
  profileName?: string | null;
  profilePicUrl?: string | null;
  integration?: string | null;
  number?: string | null;
  token?: string | null;
}

@Injectable()
export class EvolutionService {
  private readonly logger = new Logger(EvolutionService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultIntegration?: string;
  private readonly defaultTemplate?: string;
  private readonly defaultChannel?: string;
  private readonly defaultToken?: string;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('EVOLUTION_API_URL');
    const key = this.configService.get<string>('EVOLUTION_API_KEY');
    const integration = this.configService.get<string>('EVOLUTION_DEFAULT_INTEGRATION');
    const template = this.configService.get<string>('EVOLUTION_DEFAULT_TEMPLATE');
    const channel = this.configService.get<string>('EVOLUTION_DEFAULT_CHANNEL');
    const token = this.configService.get<string>('EVOLUTION_DEFAULT_TOKEN');

    if (!url || !key) {
      throw new Error(
        'Configuracoes da Evolution API ausentes. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY.'
      );
    }

    this.baseUrl = url.replace(/\/$/, '');
    this.apiKey = key;
    this.defaultIntegration = (integration ?? 'WHATSAPP').trim() || undefined;
    this.defaultTemplate = template?.trim() || undefined;
    this.defaultChannel = channel?.trim() || undefined;
    this.defaultToken = token?.trim() || undefined;
  }

  async createInstance(
    instanceName: string,
    config?: Record<string, unknown>
  ): Promise<EvolutionCreatedInstance> {
    const payload: Record<string, unknown> = {
      instanceName,
      qrcode: true,
      ...(config ?? {})
    };

    if (!('integration' in payload) && this.defaultIntegration) {
      payload.integration = this.defaultIntegration;
    }

    if (!('channel' in payload) && this.defaultChannel) {
      payload.channel = this.defaultChannel;
    }

    if (!('template' in payload) && this.defaultTemplate) {
      payload.template = this.defaultTemplate;
    }

    if (!('token' in payload) && this.defaultToken) {
      payload.token = this.defaultToken;
    }

    const response = await this.request<CreateInstanceResponse>('/instance/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const instancePayload = response.instance ?? {};
    const maybeInstance =
      (instancePayload.instance as string | undefined) ??
      (instancePayload.instanceName as string | undefined) ??
      (instancePayload.name as string | undefined) ??
      instanceName;
    const maybeName =
      (instancePayload.name as string | undefined) ??
      (instancePayload.instanceName as string | undefined) ??
      instanceName;
    const providerId =
      (instancePayload.id as string | undefined) ??
      (instancePayload.instanceId as string | undefined) ??
      (instancePayload.uuid as string | undefined);

    const result: EvolutionCreatedInstance = {
      id: maybeInstance ?? instanceName,
      name: maybeName,
      providerId,
      token:
        (instancePayload.token as string | undefined) ??
        (instancePayload.sessionKey as string | undefined),
      raw: Object.keys(instancePayload).length ? (instancePayload as Record<string, unknown>) : undefined
    };

    return result;
  }

  async getQrCode(instanceId: string, number?: string) {
    const query = number ? `?number=${encodeURIComponent(number)}` : '';
    return this.request<QrCodeResponse>(`/instance/connect/${instanceId}${query}`, {
      method: 'GET'
    });
  }

  async getState(instanceId: string) {
    try {
      return await this.request<InstanceStateResponse>(`/instance/connectionState/${instanceId}`, {
        method: 'GET'
      });
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) {
        return this.request<InstanceStateResponse>(`/instance/state/${instanceId}`, {
          method: 'GET'
        });
      }
      throw error;
    }
  }

  async logout(instanceId: string) {
    try {
      await this.request(`/instance/logout/${instanceId}`, {
        method: 'DELETE'
      });
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) {
        await this.request(`/instance/${instanceId}/logout`, {
          method: 'DELETE'
        });
        return;
      }
      throw error;
    }
  }

  async fetchInstance(
    instanceName: string,
    providerInstanceId?: string | null
  ): Promise<EvolutionInstanceSummary | null> {
    const queryPath = providerInstanceId
      ? `/instance/fetchInstances?instanceId=${providerInstanceId}`
      : '/instance/fetchInstances';

    const instances = await this.request<EvolutionInstanceSummary[]>(queryPath, {
      method: 'GET'
    });

    if (!Array.isArray(instances)) {
      return null;
    }

    const match = instances.find(
      (instance) =>
        instance.name === instanceName ||
        instance.id === providerInstanceId ||
        instance.instanceName === instanceName ||
        instance.token === providerInstanceId
    );

    return match ?? null;
  }

  async delete(instanceId: string) {
    try {
      await this.request(`/instance/${instanceId}/delete`, {
        method: 'DELETE'
      });
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) {
        await this.request(`/instance/delete/${instanceId}`, {
          method: 'DELETE'
        });
        return;
      }
      throw error;
    }
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit & { body?: string } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
        ...init.headers
      }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      this.logger.error(
        `Erro na Evolution API [${response.status}] ${url}: ${JSON.stringify(payload)}`
      );
      throw new HttpException(
        payload?.message ?? 'Erro ao comunicar com a Evolution API.',
        response.status ?? HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    return payload as T;
  }
}
