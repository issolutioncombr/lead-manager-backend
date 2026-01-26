import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleOAuthCallbackDto } from './dto/google-oauth-callback.dto';

export interface GoogleOAuthTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

export interface GoogleOAuthCallbackResult {
  message: string;
  connection: {
    userId: string;
    expiresAt: string | null;
    hasRefreshToken: boolean;
    scope?: string;
  };
}

export interface GoogleOAuthStatePayload {
  state: string;
  redirectUri: string;
  expiresAt: string;
}

export interface GoogleOAuthTokenResponse {
  accessToken: string;
  expiresAt: string | null;
  tokenType: string | null;
  scope: string | null;
  refreshed: boolean;
}

export interface GoogleOAuthConnectionStatus {
  connected: boolean;
  email: string | null;
  scope: string | null;
  expiresAt: string | null;
  hasRefreshToken: boolean;
  lastSyncedAt: string | null;
}

/**
 * Serviço que cuida do fluxo OAuth com o Google, armazenando tokens por usuário e renovando quando necessário.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private static readonly STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly ACCESS_TOKEN_EXPIRY_SKEW_MS = 60 * 1000; // 1 minute buffer

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Cria um registro de "state" (com expiração) para iniciar a autorização.
   */
  async createStateForUser(userId: string): Promise<GoogleOAuthStatePayload> {
    const redirectUri = this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URI');

    if (!redirectUri) {
      throw new InternalServerErrorException(
        'Redirect URI do Google OAuth nao esta configurada no servidor.'
      );
    }

    const state = randomUUID();
    const expiresAtDate = new Date(Date.now() + GoogleOAuthService.STATE_TTL_MS);

    await this.prisma.googleOAuthState.create({
      data: {
        state,
        userId,
        redirectUri,
        expiresAt: expiresAtDate
      }
    });

    return {
      state,
      redirectUri,
      expiresAt: expiresAtDate.toISOString()
    };
  }

  /**
   * Processa o retorno do Google (código de autorização), troca pelos tokens e persiste no banco.
   */
  async handleCallback(query: GoogleOAuthCallbackDto): Promise<GoogleOAuthCallbackResult> {
    if (query.error) {
      this.logger.warn(`Google OAuth returned an error: ${query.error}`);
      throw new BadRequestException(`Integracao com o Google falhou: ${query.error}`);
    }

    if (!query.code) {
      throw new BadRequestException('Codigo de autorizacao ausente na resposta do Google.');
    }

    const stateRecord = await this.prisma.googleOAuthState.findUnique({
      where: { state: query.state }
    });

    if (!stateRecord) {
      throw new BadRequestException('Estado de autorizacao invalido ou desconhecido.');
    }

    if (stateRecord.consumedAt) {
      throw new BadRequestException('Estado de autorizacao ja utilizado.');
    }

    if (stateRecord.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Estado de autorizacao expirado, tente conectar novamente.');
    }

    const tokens = await this.exchangeCodeForTokens(query.code, stateRecord.redirectUri);
    const profile = await this.fetchGoogleProfile(tokens.access_token).catch((error) => {
      this.logger.warn(`Nao foi possivel obter perfil do Google: ${error}`);
      return null;
    });

    const expiryDate =
      typeof tokens.expires_in === 'number'
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

    const existingAccount = await this.prisma.googleAccount.findUnique({
      where: { userId: stateRecord.userId }
    });

    const rawTokens = JSON.parse(JSON.stringify(tokens)) as Prisma.InputJsonValue;

    if (!existingAccount) {
      await this.prisma.googleAccount.create({
        data: {
          userId: stateRecord.userId,
          refreshToken: tokens.refresh_token ?? null,
          accessToken: tokens.access_token,
          tokenType: tokens.token_type ?? null,
          scope: tokens.scope ?? null,
          expiryDate,
          rawTokens,
          email: profile?.email ?? null,
          googleUserId: profile?.id ?? profile?.sub ?? null
        }
      });
    } else {
      await this.prisma.googleAccount.update({
        where: { userId: stateRecord.userId },
        data: {
          accessToken: tokens.access_token,
          tokenType: tokens.token_type ?? existingAccount.tokenType ?? undefined,
          scope: tokens.scope ?? existingAccount.scope ?? undefined,
          expiryDate: expiryDate ?? existingAccount.expiryDate ?? undefined,
          rawTokens,
          ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          ...(profile?.email ? { email: profile.email } : {}),
          ...(profile?.id || profile?.sub
            ? { googleUserId: profile.id ?? profile.sub ?? existingAccount.googleUserId ?? undefined }
            : {})
        }
      });
    }

    await this.prisma.googleOAuthState.update({
      where: { state: query.state },
      data: {
        consumedAt: new Date()
      }
    });

    return {
      message: 'Google OAuth conectado com sucesso.',
      connection: {
        userId: stateRecord.userId,
        expiresAt: expiryDate ? expiryDate.toISOString() : null,
        hasRefreshToken: Boolean(tokens.refresh_token ?? existingAccount?.refreshToken),
        scope: tokens.scope
      }
    };
  }

  /**
   * Retorna um access token pronto para uso. Faz refresh transparante quando o token estiver vencido ou faltando.
   */
  async getAccessTokenForUser(
    userId: string,
    forceRefresh = false
  ): Promise<GoogleOAuthTokenResponse> {
    const account = await this.prisma.googleAccount.findUnique({
      where: { userId },
      include: { user: true }
    });

    if (!account) {
      throw new NotFoundException('Conta do Google nao encontrada para este usuario.');
    }

    const now = Date.now();
    const expiresAtTime = account.expiryDate?.getTime() ?? 0;
    const shouldRefresh =
      forceRefresh ||
      !account.accessToken ||
      !account.expiryDate ||
      expiresAtTime <= now + GoogleOAuthService.ACCESS_TOKEN_EXPIRY_SKEW_MS;

    if (!shouldRefresh) {
      return {
        accessToken: account.accessToken ?? '',
        expiresAt: account.expiryDate ? account.expiryDate.toISOString() : null,
        tokenType: account.tokenType ?? null,
        scope: account.scope ?? null,
        refreshed: false
      };
    }

    if (!account.refreshToken) {
      throw new BadRequestException(
        'Conta Google nao possui refresh token. Refaça a conexao com o Google.'
      );
    }

    const tokens = await this.refreshAccessToken(account.refreshToken);
    const rawTokens = JSON.parse(JSON.stringify(tokens)) as Prisma.InputJsonValue;
    const expiryDate =
      typeof tokens.expires_in === 'number'
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : account.expiryDate ?? null;

    const updateData: Prisma.GoogleAccountUpdateInput = {
      accessToken: tokens.access_token,
      tokenType: tokens.token_type ?? account.tokenType ?? null,
      scope: tokens.scope ?? account.scope ?? null,
      expiryDate,
      rawTokens
    };

    if (tokens.refresh_token) {
      updateData.refreshToken = tokens.refresh_token;
    }

    const updatedAccount = await this.prisma.googleAccount.update({
      where: { userId },
      data: updateData
    });

    return {
      accessToken: updatedAccount.accessToken ?? tokens.access_token,
      expiresAt: updatedAccount.expiryDate ? updatedAccount.expiryDate.toISOString() : null,
      tokenType: updatedAccount.tokenType ?? null,
      scope: updatedAccount.scope ?? null,
      refreshed: true
    };
  }

  private async exchangeCodeForTokens(
    code: string,
    redirectUri: string
  ): Promise<GoogleOAuthTokens> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new InternalServerErrorException(
        'Credenciais do Google OAuth nao configuradas corretamente.'
      );
    }

    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const fetchFn = (globalThis as { fetch?: (input: string, init?: unknown) => Promise<any> }).fetch;

    if (!fetchFn) {
      this.logger.error('Fetch API indisponivel no ambiente do servidor.');
      throw new InternalServerErrorException('Fetch API indisponivel no ambiente do servidor.');
    }

    let response: any;
    try {
      response = await fetchFn(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });
    } catch (error) {
      this.logger.error(
        'Erro ao conectar com o Google OAuth.',
        error instanceof Error ? error.stack : String(error)
      );
      throw new InternalServerErrorException('Nao foi possivel contatar o Google OAuth.');
    }

    let payload: GoogleOAuthTokens | Record<string, unknown>;
    try {
      payload = await response.json();
    } catch (error) {
      this.logger.error(
        'Erro ao interpretar resposta do Google OAuth.',
        error instanceof Error ? error.stack : String(error)
      );
      throw new InternalServerErrorException('Resposta invalida do Google OAuth.');
    }

    if (!response.ok) {
      this.logger.error(`Falha ao trocar codigo do Google OAuth: ${JSON.stringify(payload)}`);
      throw new InternalServerErrorException(
        'Nao foi possivel trocar o codigo de autorizacao do Google.'
      );
    }

    const tokens = payload as GoogleOAuthTokens;

    if (!tokens.access_token) {
      this.logger.error(`Resposta inesperada do Google OAuth: ${JSON.stringify(payload)}`);
      throw new InternalServerErrorException('Resposta inesperada do Google OAuth.');
    }

    return tokens;
  }

  private async refreshAccessToken(refreshToken: string): Promise<GoogleOAuthTokens> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(
        'Credenciais do Google OAuth nao configuradas corretamente.'
      );
    }

    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    });

    const fetchFn = (globalThis as { fetch?: (input: string, init?: unknown) => Promise<any> }).fetch;

    if (!fetchFn) {
      this.logger.error('Fetch API indisponivel no ambiente do servidor.');
      throw new InternalServerErrorException('Fetch API indisponivel no ambiente do servidor.');
    }

    let response: any;
    try {
      response = await fetchFn(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });
    } catch (error) {
      this.logger.error(
        'Erro ao conectar com o Google OAuth (refresh).',
        error instanceof Error ? error.stack : String(error)
      );
      throw new InternalServerErrorException('Nao foi possivel atualizar o token junto ao Google.');
    }

    let payload: GoogleOAuthTokens | Record<string, unknown>;
    try {
      payload = await response.json();
    } catch (error) {
      this.logger.error(
        'Erro ao interpretar resposta do Google OAuth (refresh).',
        error instanceof Error ? error.stack : String(error)
      );
      throw new InternalServerErrorException('Resposta invalida do Google OAuth ao atualizar token.');
    }

    if (!response.ok) {
      this.logger.error(`Falha ao atualizar token do Google OAuth: ${JSON.stringify(payload)}`);
      throw new InternalServerErrorException('Nao foi possivel atualizar o token do Google.');
    }

    const tokens = payload as GoogleOAuthTokens;

    if (!tokens.access_token) {
      this.logger.error(`Resposta inesperada do Google OAuth (refresh): ${JSON.stringify(payload)}`);
      throw new InternalServerErrorException('Resposta inesperada do Google OAuth ao atualizar token.');
    }

    return tokens;
  }

  /**
   * Retorna informações resumidas sobre a conta Google vinculada (usado no frontend/n8n).
   */
  async getConnectionStatus(userId: string): Promise<GoogleOAuthConnectionStatus> {
    const account = await this.prisma.googleAccount.findUnique({
      where: { userId },
      include: { user: true }
    });

    if (!account) {
      return {
        connected: false,
        email: null,
        scope: null,
        expiresAt: null,
        hasRefreshToken: false,
        lastSyncedAt: null
      };
    }

    let email = account.email ?? null;
    let googleUserId = account.googleUserId ?? null;
    try {
      const tokenResponse = await this.getAccessTokenForUser(userId);
      const profile = await this.fetchGoogleProfile(tokenResponse.accessToken);
      if (profile?.email) {
        email = profile.email;
        googleUserId = profile.id ?? profile.sub ?? googleUserId;
        const updateData: Prisma.GoogleAccountUpdateInput = {};
        if (email !== account.email) {
          updateData.email = email;
        }
        if (googleUserId && googleUserId !== account.googleUserId) {
          updateData.googleUserId = googleUserId;
        }
        if (Object.keys(updateData).length > 0) {
          await this.prisma.googleAccount.update({
            where: { userId },
            data: updateData
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Nao foi possivel atualizar email da conta Google: ${error}`);
    }

    return {
      connected: true,
      email: email ?? account.user?.email ?? null,
      scope: account.scope ?? null,
      expiresAt: account.expiryDate ? account.expiryDate.toISOString() : null,
      hasRefreshToken: Boolean(account.refreshToken),
      lastSyncedAt: account.updatedAt ? account.updatedAt.toISOString() : null
    };
  }

  /**
   * Remove completamente a conexao Google do usuario.
   */
  async disconnect(userId: string): Promise<void> {
    const account = await this.prisma.googleAccount.findUnique({
      where: { userId }
    });

    if (!account) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.googleOAuthState.deleteMany({
        where: { userId }
      });

      await tx.googleAccount.delete({
        where: { userId }
      });
    });
  }

  private async fetchGoogleProfile(
    accessToken: string
  ): Promise<{ email?: string | null; id?: string | null; sub?: string | null } | null> {
    const fetchFn = (globalThis as { fetch?: (input: string, init?: unknown) => Promise<any> }).fetch;

    if (!fetchFn) {
      return null;
    }

    let response: any;
    try {
      response = await fetchFn('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
    } catch (error) {
      this.logger.warn(`Falha ao consultar perfil do Google: ${error}`);
      return null;
    }

    if (!response?.ok) {
      return null;
    }

    let payload: Record<string, unknown> | null = null;
    try {
      payload = await response.json();
    } catch (error) {
      this.logger.warn(`Falha ao interpretar perfil do Google: ${error}`);
      return null;
    }

    if (!payload) {
      return null;
    }

    return {
      email: typeof payload.email === 'string' ? payload.email : null,
      id: typeof payload.id === 'string' ? payload.id : null,
      sub: typeof payload.sub === 'string' ? payload.sub : null
    };
  }
}
