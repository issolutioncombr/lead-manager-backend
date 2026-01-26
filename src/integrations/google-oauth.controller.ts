import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Res
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GoogleOAuthCallbackDto } from './dto/google-oauth-callback.dto';
import {
  GoogleOAuthService,
  GoogleOAuthTokenResponse,
  GoogleOAuthStatePayload,
  GoogleOAuthConnectionStatus
} from './google-oauth.service';
import { GoogleOAuthTokenRequestDto } from './dto/google-oauth-token-request.dto';

type AuthenticatedUser = {
  userId: string;
  email: string;
};

/**
 * Endpoints responsáveis por iniciar o OAuth do Google e consultar o estado da conexão.
 * Todos dependem do JWT do CRM, exceto o callback público.
 */
@Controller('google/oauth')
export class GoogleOAuthController {
  constructor(
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Gera um "state" seguro para iniciar o fluxo de autorização.
   */
  @Post('state')
  createState(@CurrentUser() user: AuthenticatedUser): Promise<GoogleOAuthStatePayload> {
    return this.googleOAuthService.createStateForUser(user.userId);
  }

  /**
   * Retorna um access token válido (renovando com o refresh token, se preciso).
   */
  @Post('token')
  getToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: GoogleOAuthTokenRequestDto
  ): Promise<GoogleOAuthTokenResponse> {
    return this.googleOAuthService.getAccessTokenForUser(user.userId, body.forceRefresh ?? false);
  }

  /**
   * Informa se o usuário já conectou o Google e exibe dados básicos da conta.
   */
  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser): Promise<GoogleOAuthConnectionStatus> {
    return this.googleOAuthService.getConnectionStatus(user.userId);
  }

  /**
   * Remove a agenda Google conectada do usuario atual.
   */
  @Delete('disconnect')
  async disconnect(@CurrentUser() user: AuthenticatedUser): Promise<{ success: true }> {
    await this.googleOAuthService.disconnect(user.userId);
    return { success: true };
  }

  /**
   * Callback chamado pelo Google após o consentimento. Se o cliente espera JSON devolvemos a resposta direta;
   * caso contrário redirecionamos para o frontend com o status na query string.
   */
  @Public()
  @Get('callback')
  async handleCallback(
    @Query() query: GoogleOAuthCallbackDto,
    @Headers('accept') acceptHeader: string | undefined,
    @Res() res: Response
  ): Promise<void> {
    const wantsJson = acceptHeader?.includes('application/json');

    try {
      const result = await this.googleOAuthService.handleCallback(query);

      if (wantsJson) {
        res.status(HttpStatus.OK).json(result);
        return;
      }

      const redirectUrl = this.buildFrontendRedirectUrl('success', result.message);
      res.redirect(HttpStatus.FOUND, redirectUrl);
    } catch (error) {
      const status =
        error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      const message = this.extractErrorMessage(error);

      if (wantsJson) {
        res.status(status).json({ message, status });
        return;
      }

      const redirectUrl = this.buildFrontendRedirectUrl('error', message);
      res.redirect(HttpStatus.FOUND, redirectUrl);
    }
  }

  /**
   * Monta a URL para redirecionar o usuário de volta ao frontend.
   * IMPORTANTE: manter a variável FRONTEND_URL configurada em produção (substituir http://localhost:3000).
   */
  private buildFrontendRedirectUrl(status: 'success' | 'error', message: string): string {
    const baseUrl =
      this.configService.get<string>('FRONTEND_URL') ??
      this.configService.get<string>('NEXT_PUBLIC_APP_URL') ??
      'http://localhost:3000';

    const url = new URL('/integrations', baseUrl);
    url.searchParams.set('integration', 'google');
    url.searchParams.set('status', status);
    url.searchParams.set('message', message);
    return url.toString();
  }

  /**
   * Normaliza mensagens de erro vindas do fluxo OAuth para exibirmos algo amigável.
   */
  private extractErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (typeof response === 'object' && response !== null && 'message' in response) {
        const message = (response as { message?: string | string[] }).message;
        if (Array.isArray(message)) {
          return message.join(', ');
        }
        if (message) {
          return message;
        }
      }
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Erro inesperado ao processar o retorno do Google.';
  }
}
