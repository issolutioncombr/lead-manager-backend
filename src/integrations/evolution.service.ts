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
  private discoveredPaths?: { chats?: string; conversation?: string };
  private readonly isMock: boolean = false;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('EVOLUTION_API_URL');
    const key = this.configService.get<string>('EVOLUTION_API_KEY');
    const integration = this.configService.get<string>('EVOLUTION_DEFAULT_INTEGRATION');
    const template = this.configService.get<string>('EVOLUTION_DEFAULT_TEMPLATE');
    const channel = this.configService.get<string>('EVOLUTION_DEFAULT_CHANNEL');
    const token = this.configService.get<string>('EVOLUTION_DEFAULT_TOKEN');

    if (!url || !key) {
      this.isMock = true;
    }

    this.baseUrl = (url ?? '').replace(/\/$/, '');
    this.apiKey = key ?? '';
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

  async sendMessage(payload: {
    instanceId?: string | null;
    number: string;
    text?: string;
    mediaUrl?: string;
    caption?: string;
    token?: string | null;
  }): Promise<{ id?: string; message?: string; status?: string }> {
    const body: Record<string, unknown> = {
      number: payload.number,
      token: payload.token ?? this.defaultToken ?? null
    };
    if (payload.text) body.text = payload.text;
    if (payload.mediaUrl) body.mediaUrl = payload.mediaUrl;
    if (payload.caption) body.caption = payload.caption;
    if (payload.instanceId) body.instanceId = payload.instanceId;

    return this.request<{ id?: string; message?: string; status?: string }>(
      '/messages/send',
      {
        method: 'POST',
        body: JSON.stringify(body)
      }
    );
  }

  async getConversation(number: string, opts?: { limit?: number; cursor?: string; token?: string; instanceId?: string }) {
    const path = await this.getConversationPath(number, opts);
    return this.request<any>(path, { method: 'GET' });
  }

  async listChats(opts?: { instanceId?: string; limit?: number; cursor?: string; token?: string }) {
    const path = await this.getChatsPath(opts);
    return this.request<any>(path, { method: 'GET' });
  }

  async findChats(opts: { instanceId: string; where?: Record<string, any>; limit?: number; token?: string }) {
    const body: Record<string, any> = {
      where: opts.where ?? {},
      limit: opts.limit ?? 100
    };
    if (opts.token) body.token = opts.token;
    return this.request<any>(`/chat/findChats/${opts.instanceId}`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  async findMessages(opts: { instanceId: string; where: Record<string, any>; limit?: number; token?: string }) {
    const body: Record<string, any> = {
      where: opts.where,
      limit: opts.limit ?? 200
    };
    if (opts.token) body.token = opts.token;
    return this.request<any>(`/chat/findMessages/${opts.instanceId}`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  private async getChatsPath(opts?: { instanceId?: string; limit?: number; cursor?: string; token?: string }): Promise<string> {
    if (this.discoveredPaths?.chats) {
      return this.appendQuery(this.discoveredPaths.chats, opts);
    }
    const candidates = ['/messages/chats', '/chats', '/chat/list', '/messages/contacts', '/contacts'];
    for (const base of candidates) {
      const tryPath = this.appendQuery(base, { limit: opts?.limit ?? 100, instanceId: opts?.instanceId, token: opts?.token });
      const ok = await this.probe(tryPath);
      if (ok) {
        this.discoveredPaths = { ...(this.discoveredPaths ?? {}), chats: base };
        return tryPath;
      }
    }
    this.discoveredPaths = { ...(this.discoveredPaths ?? {}), chats: '/messages/chats' };
    return this.appendQuery('/messages/chats', opts);
  }

  private async getConversationPath(number: string, opts?: { limit?: number; cursor?: string; token?: string; instanceId?: string }): Promise<string> {
    if (this.discoveredPaths?.conversation) {
      return this.appendQuery(this.discoveredPaths.conversation, { number, limit: opts?.limit, cursor: opts?.cursor, token: opts?.token, instanceId: opts?.instanceId });
    }
    const candidates = [
      `/messages/conversation`,
      `/chat/conversation`,
      `/conversation`,
      `/messages/history`
    ];
    const paramKeys = ['number', 'phone', 'jid', 'remoteJid'];
    for (const base of candidates) {
      for (const p of paramKeys) {
        const tryPath = this.appendQuery(base, { [p]: number, limit: opts?.limit, cursor: opts?.cursor, token: opts?.token, instanceId: opts?.instanceId });
        const ok = await this.probe(tryPath);
        if (ok) {
          const baseWithoutQuery = base.split('?')[0];
          this.discoveredPaths = { ...(this.discoveredPaths ?? {}), conversation: baseWithoutQuery };
          return tryPath;
        }
      }
      // Try as path segment
      const segPath = `${base}/${encodeURIComponent(number)}`;
      const segTry = this.appendQuery(segPath, { limit: opts?.limit, cursor: opts?.cursor, token: opts?.token, instanceId: opts?.instanceId });
      const okSeg = await this.probe(segTry);
      if (okSeg) {
        this.discoveredPaths = { ...(this.discoveredPaths ?? {}), conversation: base };
        return segTry;
      }
    }
    const fallbackBase = `/messages/conversation`;
    this.discoveredPaths = { ...(this.discoveredPaths ?? {}), conversation: fallbackBase };
    return this.appendQuery(fallbackBase, { number, limit: opts?.limit, cursor: opts?.cursor, token: opts?.token, instanceId: opts?.instanceId });
  }

  private appendQuery(path: string, params?: Record<string, any> | undefined): string {
    if (!params || !Object.keys(params).length) return path.endsWith('?') ? path.slice(0, -1) : path;
    const base = path.endsWith('?') ? path.slice(0, -1) : path;
    const hasQuery = base.includes('?');
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      qs.append(k, String(v));
    }
    const sep = hasQuery ? '&' : '?';
    return `${base}${sep}${qs.toString()}`;
  }

  private async probe(path: string): Promise<boolean> {
    try {
      if (this.isMock) {
        return true;
      }
      const url = `${this.baseUrl}${path}`;
      const resp = await fetch(url, { method: 'GET', headers: { apikey: this.apiKey } });
      if (!resp.ok) return false;
      const payload = await resp.json().catch(() => ({}));
      if (Array.isArray(payload)) return true;
      if (Array.isArray((payload as any)?.data)) return true;
      if (Array.isArray((payload as any)?.messages)) return true;
      if (Array.isArray((payload as any)?.chats)) return true;
      if (Array.isArray((payload as any)?.contacts)) return true;
      return true;
    } catch {
      return false;
    }
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit & { body?: string } = {}
  ): Promise<T> {
    if (this.isMock) {
      return this.mockResponse<T>(path) as T;
    }
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
      if (response.status === 404) {
        let instanceName = '';
        let remoteJid = '';
        try {
          const match = path.match(/\/chat\/findMessages\/(.+?)(?:$|\?|\/)/);
          if (match) instanceName = match[1];
          if (init.body) {
            const bodyObj = JSON.parse(init.body);
            remoteJid = bodyObj?.where?.remoteJid ?? '';
          }
        } catch (e) { void e; }
        const key = `404:${instanceName}:${remoteJid}`;
        const now = Date.now();
        const last = (this as any)._last404Log?.get?.(key) ?? 0;
        if (!(this as any)._last404Log) (this as any)._last404Log = new Map<string, number>();
        if (now - last >= 60_000) {
          (this as any)._last404Log.set(key, now);
          this.logger.error(
            `Erro 404 na Evolution API ${url} ${remoteJid ? `remoteJid=${remoteJid}` : ''}`
          );
        }
      } else {
        this.logger.error(
          `Erro na Evolution API [${response.status}] ${url}: ${JSON.stringify(payload)}`
        );
      }
      throw new HttpException(
        payload?.message ?? 'Erro ao comunicar com a Evolution API.',
        response.status ?? HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    return payload as T;
  }

  private mockResponse<T>(path: string): unknown {
    const url = new URL(`http://mock${path}`);
    const number = url.searchParams.get('number') ?? '';
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const now = Math.floor(Date.now() / 1000);
    const mkMsg = (fromMe: boolean, text: string, tsOffset: number) => ({
      key: { fromMe, id: `${fromMe ? 'me' : 'them'}-${now - tsOffset}` },
      message: { conversation: text },
      messageTimestamp: now - tsOffset
    });
    const mkChat = (contact: string, name: string) => ({
      id: `${contact}-${now}`,
      remoteJid: `${contact}@s.whatsapp.net`,
      pushName: name,
      lastMessage: { message: { conversation: 'Olá!' }, messageTimestamp: now }
    });
    if (url.pathname.includes('/messages/chats') || url.pathname.includes('/contacts') || url.pathname.includes('/chat/list')) {
      const chats = [
        mkChat('5511978624271', 'Suporte Débora Segateli'),
        mkChat('5511978728435', 'Suporte Débora Segateli')
      ];
      return { chats };
    }
    if (url.pathname.includes('/messages/conversation') || url.pathname.includes('/conversation') || url.pathname.includes('/messages/history') || url.pathname.includes('/chat/conversation')) {
      const normalized = (number || '').replace(/\D+/g, '');
      const msgs = [
        mkMsg(false, `Teste de conversa com ${normalized}`, 5000),
        mkMsg(true, 'Mensagem enviada pelo operador', 4000),
        mkMsg(false, 'Recebido, obrigado!', 3000)
      ].slice(0, Math.max(1, Math.min(limit, 50)));
      return { messages: msgs };
    }
    if (url.pathname.includes('/instance')) {
      return { status: 'mock' };
    }
    return { data: [] };
  }
}
