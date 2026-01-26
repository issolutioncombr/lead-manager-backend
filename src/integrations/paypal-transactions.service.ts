import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';

import { paypalConfig, PaypalConfig } from './paypal.config';
import { PaypalOAuthService } from './paypal-oauth.service';
import { PaypalTransactionsQueryDto } from './dto/paypal-transactions-query.dto';

interface PaypalAmount {
  currency?: string | null;
  value?: string | null;
}

interface PaypalTransactionInfo {
  transaction_id?: string;
  paypal_reference_id?: string;
  transaction_event_code?: string;
  transaction_initiation_date?: string;
  transaction_updated_date?: string;
  transaction_status?: string;
  transaction_amount?: PaypalAmount;
  fee_amount?: PaypalAmount;
  net_amount?: PaypalAmount;
  custom_field?: string;
  invoice_id?: string;
}

interface PaypalPayerInfo {
  email_address?: string;
  payer_name?: {
    alternate_full_name?: string;
    given_name?: string;
    surname?: string;
    full_name?: string;
  };
  payer_id?: string;
}

interface PaypalTransactionDetail {
  transaction_info?: PaypalTransactionInfo;
  payer_info?: PaypalPayerInfo;
  [key: string]: unknown;
}

interface PaypalTransactionSearchResponse {
  transaction_details?: PaypalTransactionDetail[];
  total_items?: string;
  page_size?: string;
  page?: string;
  total_pages?: string;
  [key: string]: unknown;
}

export interface NormalizedPaypalTransaction {
  transactionId: string | null;
  transactionStatus: string | null;
  transactionEventCode: string | null;
  transactionInitiationDate: string | null;
  transactionUpdatedDate: string | null;
  paypalReferenceId: string | null;
  customField: string | null;
  invoiceId: string | null;
  transactionAmount: { currency: string | null; value: number | null };
  feeAmount: { currency: string | null; value: number | null };
  netAmount: { currency: string | null; value: number | null };
  payer: {
    email: string | null;
    name: string | null;
    payerId: string | null;
  };
  raw: Record<string, unknown>;
}

export interface PaypalTransactionListResult {
  summary: {
    totalItems: number;
    page: number;
    totalPages: number;
    pageSize: number;
  };
  transactions: NormalizedPaypalTransaction[];
  raw: Record<string, unknown>;
}

const DEFAULT_PAGE_SIZE = 100;

@Injectable()
export class PaypalTransactionsService {
  private readonly logger = new Logger(PaypalTransactionsService.name);

  constructor(
    @Inject(paypalConfig.KEY) private readonly config: PaypalConfig,
    private readonly paypalOAuthService: PaypalOAuthService
  ) {}

  async listTransactions(
    userId: string,
    query: PaypalTransactionsQueryDto
  ): Promise<PaypalTransactionListResult> {
    const range = this.normalizeDateRange(query.startDate, query.endDate);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    let token = await this.paypalOAuthService.getAccessTokenForUser(userId, false);
    let response = await this.fetchTransactions(token.accessToken, {
      startDate: range.start,
      endDate: range.end,
      transactionStatus: query.transactionStatus,
      page,
      pageSize
    });

    if (response.status === 401) {
      this.logger.warn('Token PayPal expirado ao consultar transacoes; tentando atualizar.');
      token = await this.paypalOAuthService.getAccessTokenForUser(userId, true);
      response = await this.fetchTransactions(token.accessToken, {
        startDate: range.start,
        endDate: range.end,
        transactionStatus: query.transactionStatus,
        page,
        pageSize
      });
    }

    let payload: PaypalTransactionSearchResponse;
    try {
      payload = (await response.json()) as PaypalTransactionSearchResponse;
    } catch (error) {
      this.logger.error(
        'Erro ao interpretar resposta do PayPal Transaction Search.',
        error instanceof Error ? error.stack : String(error)
      );
      throw new InternalServerErrorException('Resposta invalida ao consultar transacoes do PayPal.');
    }

    if (!response.ok) {
      this.logger.error(
        `Consulta de transacoes do PayPal falhou com status ${response.status}: ${JSON.stringify(payload)}`
      );
      throw new InternalServerErrorException('Nao foi possivel consultar as transacoes do PayPal.');
    }

    return this.normalizeTransactionList(payload);
  }

  private async fetchTransactions(
    accessToken: string,
    params: {
      startDate: string;
      endDate: string;
      transactionStatus?: string;
      page: number;
      pageSize: number;
    }
  ) {
    const fetchFn = (globalThis as {
      fetch?: (input: string, init?: unknown) => Promise<any>;
    }).fetch;

    if (!fetchFn) {
      throw new InternalServerErrorException('Fetch API indisponivel no ambiente do servidor.');
    }

    const endpoint = this.buildTransactionsEndpoint(params);

    try {
      return await fetchFn(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      });
    } catch (error) {
      this.logger.error(
        'Erro ao conectar na API de Transaction Search do PayPal.',
        error instanceof Error ? error.stack : String(error)
      );
      throw new InternalServerErrorException('Nao foi possivel consultar a API de transacoes do PayPal.');
    }
  }

  private buildTransactionsEndpoint(params: {
    startDate: string;
    endDate: string;
    transactionStatus?: string;
    page: number;
    pageSize: number;
  }): string {
    const base = this.config.baseUrl || 'https://api-m.sandbox.paypal.com';
    const url = new URL('/v1/reporting/transactions', base.endsWith('/') ? base : `${base}/`);

    url.searchParams.set('start_date', params.startDate);
    url.searchParams.set('end_date', params.endDate);
    url.searchParams.set('page', String(params.page));
    url.searchParams.set('page_size', String(params.pageSize));
    url.searchParams.set('fields', 'transaction_info,payer_info');

    if (params.transactionStatus) {
      url.searchParams.set('transaction_status', params.transactionStatus);
    }

    return url.toString();
  }

  private normalizeTransactionList(
    payload: PaypalTransactionSearchResponse
  ): PaypalTransactionListResult {
    const details = Array.isArray(payload.transaction_details)
      ? payload.transaction_details
      : [];

    return {
      summary: {
        totalItems: this.safeParseInt(payload.total_items) ?? details.length,
        page: this.safeParseInt(payload.page) ?? 1,
        totalPages: this.safeParseInt(payload.total_pages) ?? 1,
        pageSize: this.safeParseInt(payload.page_size) ?? details.length
      },
      transactions: details.map((item) => this.normalizeTransaction(item)),
      raw: payload as Record<string, unknown>
    };
  }

  private normalizeTransaction(detail: PaypalTransactionDetail): NormalizedPaypalTransaction {
    const info: PaypalTransactionInfo = detail.transaction_info ?? {};
    const payer: PaypalPayerInfo = detail.payer_info ?? {};

    return {
      transactionId: info.transaction_id ?? null,
      transactionStatus: info.transaction_status ?? null,
      transactionEventCode: info.transaction_event_code ?? null,
      transactionInitiationDate: info.transaction_initiation_date ?? null,
      transactionUpdatedDate: info.transaction_updated_date ?? null,
      paypalReferenceId: info.paypal_reference_id ?? null,
      customField: info.custom_field ?? null,
      invoiceId: info.invoice_id ?? null,
      transactionAmount: this.normalizeAmount(info.transaction_amount),
      feeAmount: this.normalizeAmount(info.fee_amount),
      netAmount: this.normalizeAmount(info.net_amount),
      payer: {
        email: payer.email_address ?? null,
        name: this.extractPayerName(payer) ?? null,
        payerId: payer.payer_id ?? null
      },
      raw: detail as Record<string, unknown>
    };
  }

  private normalizeAmount(amount?: PaypalAmount): { currency: string | null; value: number | null } {
    if (!amount) {
      return { currency: null, value: null };
    }

    const value = amount.value ? Number(amount.value) : null;

    return {
      currency: amount.currency ?? null,
      value: Number.isFinite(value as number) ? (value as number) : null
    };
  }

  private extractPayerName(payer: PaypalPayerInfo): string | null {
    if (!payer.payer_name) {
      return null;
    }

    const { full_name, alternate_full_name, given_name, surname } = payer.payer_name;

    if (full_name) {
      return full_name;
    }

    if (alternate_full_name) {
      return alternate_full_name;
    }

    if (given_name || surname) {
      return [given_name, surname].filter(Boolean).join(' ').trim() || null;
    }

    return null;
  }

  private normalizeDateRange(start: string, end: string): { start: string; end: string } {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Datas de inicio e fim precisam estar em formato ISO 8601.');
    }

    if (startDate > endDate) {
      throw new BadRequestException('A data inicial deve ser anterior ou igual a data final.');
    }

    return {
      start: this.formatDateForPaypal(startDate),
      end: this.formatDateForPaypal(endDate)
    };
  }

  private formatDateForPaypal(date: Date): string {
    const iso = date.toISOString(); // sempre em UTC (termina com Z)
    return iso.replace(/\.\d{3}Z$/, 'Z');
  }

  private safeParseInt(value?: string): number | null {
    if (!value) {
      return null;
    }

    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
}

