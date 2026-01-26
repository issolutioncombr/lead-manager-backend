import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { AppointmentsModule } from './appointments/appointments.module';
import { AlunosModule } from './alunos/alunos.module';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ClientsModule } from './clients/clients.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CourseLeadsModule } from './course-leads/course-leads.module';
import { FunnelEventsModule } from './funnel-events/funnel-events.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { LeadsModule } from './leads/leads.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { SellersModule } from './sellers/sellers.module';
import { UsersModule } from './users/users.module';
import { SellerAvailabilityModule } from './seller-availability/seller-availability.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    ClientsModule,
    AlunosModule,
    CourseLeadsModule,
    LeadsModule,
    AppointmentsModule,
    CampaignsModule,
    SellersModule,
    ReportsModule,
    FunnelEventsModule,
    IntegrationsModule,
    CommonModule,
    SellerAvailabilityModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    }
  ]
})
export class AppModule {}
