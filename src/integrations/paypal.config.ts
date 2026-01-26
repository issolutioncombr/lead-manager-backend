import { ConfigType, registerAs } from '@nestjs/config';

export interface PaypalEnvConfig {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  baseUrl: string;
  authBaseUrl: string;
  scopes: string[];
}

const DEFAULT_API_BASE_URL = 'https://api-m.sandbox.paypal.com';
const DEFAULT_AUTH_BASE_URL = 'https://www.sandbox.paypal.com';

const normalizeScopes = (scopesRaw: string | undefined | null): string[] => {
  if (!scopesRaw) {
    return [];
  }

  return scopesRaw
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
};

export const paypalConfig = registerAs('paypal', (): PaypalEnvConfig => {
  const baseUrl = process.env.PAYPAL_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
  const authBaseUrl = process.env.PAYPAL_AUTH_BASE_URL?.trim() || DEFAULT_AUTH_BASE_URL;

  return {
    clientId: process.env.PAYPAL_CLIENT_ID?.trim() || null,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET?.trim() || null,
    redirectUri: process.env.PAYPAL_REDIRECT_URI?.trim() || null,
    baseUrl,
    authBaseUrl,
    scopes: normalizeScopes(process.env.PAYPAL_SCOPES)
  };
});

export type PaypalConfig = ConfigType<typeof paypalConfig>;

