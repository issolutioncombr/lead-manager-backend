import { Injectable } from '@nestjs/common';
import { AppointmentStatus, LeadStage } from '@prisma/client';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
dayjs.extend(weekOfYear);

import { PrismaService } from '../prisma/prisma.service';

interface DateRange {
  start?: string;
  end?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService
  ) {}

  async funnel(userId: string) {
    const qualifiedStages = [
      LeadStage.AGENDOU_CALL,
      LeadStage.ENTROU_CALL,
      LeadStage.COMPROU
    ];

    const [leadCount, qualifiedLeadCount, bookedAppointments, completedAppointments] =
      await Promise.all([
        this.prisma.lead.count({ where: { userId } }),
        this.prisma.lead.count({ where: { userId, stage: { in: qualifiedStages } } }),
        this.prisma.appointment.count({ where: { userId } }),
        this.prisma.appointment.count({
          where: { userId, status: AppointmentStatus.AGENDADA }
        })
      ]);

    const counts = {
      lead_created: leadCount,
      lead_qualified: qualifiedLeadCount,
      appointment_booked: bookedAppointments,
      appointment_completed: completedAppointments
    };

    const conversionRate =
      counts.lead_created
        ? Number(((counts.appointment_completed / counts.lead_created) * 100).toFixed(2))
        : 0;

    return {
      counts,
      conversionRate
    };
  }

  async revenue(_userId: string, period: 'day' | 'month', range: DateRange) {
    // MVP: sem pagamentos, retornamos 0.
    return {
      total: 0,
      series: []
    };
  }

  async appointments(userId: string, range: DateRange) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        userId,
        start: range.start ? { gte: new Date(range.start) } : undefined,
        end: range.end ? { lte: new Date(range.end) } : undefined
      }
    });

    const byStatus = Object.values(AppointmentStatus).reduce<Record<string, number>>(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {}
    );

    appointments.forEach((appointment) => {
      byStatus[appointment.status] = (byStatus[appointment.status] ?? 0) + 1;
    });

    const byWeek = appointments.reduce<Record<string, number>>((acc, appointment) => {
      const d = dayjs(appointment.start);
      const weekNum = String(d.week()).padStart(2, '0');
      const label = `${d.year()}-W${weekNum}`;
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    }, {});

    return {
      byStatus,
      byWeek: Object.entries(byWeek)
        .map(([label, total]) => ({ label, total }))
        .sort((a, b) => (a.label > b.label ? 1 : -1))
    };
  }
}
