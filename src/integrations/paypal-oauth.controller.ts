import {
  Body,
  Controller,
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
import { PaypalOAuthCallbackDto } from './dto/paypal-oauth-callback.dto';
import { PaypalOAuthTokenRequestDto } from './dto/paypal-oauth-token-request.dto';
import {
  PaypalOAuthService,
  PaypalOAuthTokenResponse,
  PaypalOAuthStatePayload,
  PaypalOAuthConnectionStatus,
  PaypalOAuthCallbackResult
} from './paypal-oauth.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
};

@Controller('paypal/oauth')
export class PaypalOAuthController {
  constructor(
    private readonly paypalOAuthService: PaypalOAuthService,
    private readonly configService: ConfigService
  ) {}

  @Post('state')
  createState(@CurrentUser() user: AuthenticatedUser): Promise<PaypalOAuthStatePayload> {
    return this.paypalOAuthService.createAuthorizationIntent(user.userId);
  }

  @Post('token')
  getToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PaypalOAuthTokenRequestDto
  ): Promise<PaypalOAuthTokenResponse> {
    return this.paypalOAuthService.getAccessTokenForUser(
      user.userId,
      body.forceRefresh ?? false
    );
  }

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser): Promise<PaypalOAuthConnectionStatus> {
    return this.paypalOAuthService.getConnectionStatus(user.userId);
  }

  @Public()
  @Get('callback')
  async handleCallback(
    @Query() query: PaypalOAuthCallbackDto,
    @Headers('accept') acceptHeader: string | undefined,
    @Res() res: Response
  ): Promise<void> {
    const wantsJson = acceptHeader?.includes('application/json');

    try {
      const result: PaypalOAuthCallbackResult = await this.paypalOAuthService.handleCallback(query);

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

  private buildFrontendRedirectUrl(status: 'success' | 'error', message: string): string {
    const baseUrl =
      this.configService.get<string>('FRONTEND_URL') ??
      this.configService.get<string>('NEXT_PUBLIC_APP_URL') ??
      'http://localhost:3000';

    const url = new URL('/integrations', baseUrl);
    url.searchParams.set('integration', 'paypal');
    url.searchParams.set('status', status);
    url.searchParams.set('message', message);
    return url.toString();
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
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

    return 'Erro inesperado ao processar o retorno do PayPal.';
  }
}

