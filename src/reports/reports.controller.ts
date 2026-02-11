import { Controller, Get, Query } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
};

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('funnel')
  funnel(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.funnel(user.userId);
  }

  @Get('revenue')
  revenue(
    @CurrentUser() user: AuthenticatedUser,
    @Query('period') period: 'day' | 'month' = 'day',
    @Query('start') start?: string,
    @Query('end') end?: string
  ) {
    return this.reportsService.revenue(user.userId, period, { start, end });
  }

  @Get('appointments')
  appointments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('start') start?: string,
    @Query('end') end?: string
  ) {
    return this.reportsService.appointments(user.userId, { start, end });
  }

  @Get('appointments-by-seller')
  appointmentsBySeller(
    @CurrentUser() user: AuthenticatedUser,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('sellerId') sellerId?: string,
    @Query('status') status?: AppointmentStatus
  ) {
    return this.reportsService.appointmentsBySeller(user.userId, { start, end, sellerId, status });
  }

  @Get('dashboard')
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string
  ) {
    return this.reportsService.dashboard(user.userId, date);
  }

  @Get('dashboard/series')
  dashboardSeries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('endDate') endDate?: string,
    @Query('days') days?: string
  ) {
    return this.reportsService.dashboardSeries(user.userId, endDate, days);
  }
}
