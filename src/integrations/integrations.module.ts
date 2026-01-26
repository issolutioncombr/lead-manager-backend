import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ClientsModule } from '../clients/clients.module';
import { LeadsModule } from '../leads/leads.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { GoogleOAuthController } from './google-oauth.controller';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarController } from './google-calendar.controller';
import { EvolutionService } from './evolution.service';
import { EvolutionIntegrationService } from './evolution-integration.service';
import { EvolutionController } from './evolution.controller';
import { paypalConfig } from './paypal.config';
import { PaypalOAuthService } from './paypal-oauth.service';
import { PaypalOAuthController } from './paypal-oauth.controller';
import { PaypalTransactionsService } from './paypal-transactions.service';
import { PaypalTransactionsController } from './paypal-transactions.controller';
// Meta OAuth removed from project

/**
 * Módulo que agrega todas as integrações externas (Google Forms, OAuth e Calendar).
 * Em produção basta manter este módulo importado para disponibilizar os endpoints /api/google/*
 */
@Module({
  imports: [ConfigModule.forFeature(paypalConfig), ClientsModule, LeadsModule, PrismaModule, UsersModule],
  controllers: [
    IntegrationsController,
    GoogleOAuthController,
    PaypalOAuthController,
    PaypalTransactionsController,
    GoogleCalendarController,
    EvolutionController
  ],
  providers: [
    IntegrationsService,
    GoogleOAuthService,
    PaypalOAuthService,
    PaypalTransactionsService,
    GoogleCalendarService,
    EvolutionService,
    EvolutionIntegrationService
  ],
  exports: [PaypalOAuthService, PaypalTransactionsService]
})
export class IntegrationsModule {}
