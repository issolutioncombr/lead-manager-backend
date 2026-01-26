import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { calendar_v3, google } from 'googleapis';

import { GoogleOAuthService } from './google-oauth.service';

/**
 * Serviço que encapsula todas as chamadas ao Google Calendar usando os tokens salvos no banco.
 * Assim o restante do sistema (frontend/n8n) conversa apenas com o backend.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private readonly googleOAuthService: GoogleOAuthService) {}

  /**
   * Monta um cliente autenticado do Google Calendar para o usuário informado.
   * Também garante que a conta já está conectada e renova o access token caso seja necessário.
   */
  private async buildClient(userId: string): Promise<calendar_v3.Calendar> {
    const status = await this.googleOAuthService.getConnectionStatus(userId);

    if (!status.connected) {
      throw new NotFoundException('Nenhuma conta Google vinculada a este usuario.');
    }

    const tokenResponse = await this.googleOAuthService.getAccessTokenForUser(userId);

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: tokenResponse.accessToken });
      return google.calendar({ version: 'v3', auth });
    } catch (error) {
      this.logger.error(
        'Falha ao construir cliente do Google Calendar.',
        error instanceof Error ? error.stack : String(error)
      );
      throw new InternalServerErrorException('Nao foi possivel preparar integracao com o Google.');
    }
  }

  /**
   * Lista eventos conforme os parâmetros aceitos pela API oficial.
   */
  async listEvents(
    userId: string,
    params: calendar_v3.Params$Resource$Events$List
  ): Promise<calendar_v3.Schema$Events> {
    const client = await this.buildClient(userId);
    const response = await client.events.list(params);
    return response.data;
  }

  /**
   * Busca um evento específico.
   */
  async getEvent(
    userId: string,
    params: calendar_v3.Params$Resource$Events$Get
  ): Promise<calendar_v3.Schema$Event> {
    const client = await this.buildClient(userId);
    const response = await client.events.get(params);
    return response.data;
  }

  /**
   * Cria um novo evento no calendário do usuário.
   */
  async insertEvent(
    userId: string,
    params: calendar_v3.Params$Resource$Events$Insert
  ): Promise<calendar_v3.Schema$Event> {
    const client = await this.buildClient(userId);
    const response = await client.events.insert(params);
    return response.data;
  }

  /**
   * Atualiza parcialmente um evento existente.
   */
  async patchEvent(
    userId: string,
    params: calendar_v3.Params$Resource$Events$Patch
  ): Promise<calendar_v3.Schema$Event> {
    const client = await this.buildClient(userId);
    const response = await client.events.patch(params);
    return response.data;
  }

  /**
   * Remove um evento do calendário do usuário.
   */
  async deleteEvent(
    userId: string,
    params: calendar_v3.Params$Resource$Events$Delete
  ): Promise<void> {
    const client = await this.buildClient(userId);
    await client.events.delete(params);
  }
}
