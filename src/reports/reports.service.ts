import { BadRequestException, Injectable } from '@nestjs/common';
import { AppointmentStatus, LeadStage } from '@prisma/client';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import weekOfYear from 'dayjs/plugin/weekOfYear';
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(weekOfYear);

import { PrismaService } from '../prisma/prisma.service';

interface DateRange {
  start?: string;
  end?: string;
}

type DashboardStageStats = {
  stage: LeadStage;
  count: number;
  percent: number;
};

type DashboardSourceFunnel = {
  source: string;
  totalLeads: number;
  stages: DashboardStageStats[];
  conversion: {
    agendouFromNovo: number;
    entrouFromAgendou: number;
    comprouFromEntrou: number;
    comprouFromNovo: number;
  };
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService
  ) {}

  private normalizeSource(raw?: string | null) {
    const value = (raw ?? '').trim();
    if (!value) {
      return 'Nao informado';
    }

    const lowered = value.toLowerCase();
    if (lowered.includes('whats') || lowered.includes('wpp')) {
      return 'WhatsApp';
    }

    if (lowered.includes('insta')) {
      return 'Instagram';
    }

    return value;
  }

  private resolveDayRange(date?: string) {
    const tz = 'America/Sao_Paulo';
    const dateStr = date?.trim() || dayjs().tz(tz).format('YYYY-MM-DD');

    const isValid = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && dayjs(dateStr, 'YYYY-MM-DD', true).isValid();
    if (!isValid) {
      throw new BadRequestException('Data invalida. Use YYYY-MM-DD.');
    }

    const start = dayjs.tz(dateStr, 'YYYY-MM-DD', tz).startOf('day');
    const end = start.add(1, 'day');

    return {
      date: dateStr,
      start: start.toDate(),
      end: end.toDate()
    };
  }

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

  async dashboard(userId: string, date?: string) {
    const range = this.resolveDayRange(date);

    const whereLead = {
      userId,
      createdAt: {
        gte: range.start,
        lt: range.end
      }
    };

    const [totalLeads, leadsByStage, leadsBySourceStage] = await Promise.all([
      this.prisma.lead.count({ where: whereLead }),
      this.prisma.lead.groupBy({
        by: ['stage'],
        where: whereLead,
        _count: { _all: true }
      }),
      this.prisma.lead.groupBy({
        by: ['source', 'stage'],
        where: whereLead,
        _count: { _all: true }
      })
    ]);

    const stageCounts = leadsByStage.reduce<Record<string, number>>((acc, item) => {
      acc[item.stage] = item._count._all;
      return acc;
    }, {});

    const stageOrder: LeadStage[] = [
      LeadStage.NOVO,
      LeadStage.AGENDOU_CALL,
      LeadStage.ENTROU_CALL,
      LeadStage.COMPROU,
      LeadStage.NO_SHOW
    ];

    const top5Statuses = stageOrder.map((stage) => {
      const count = stageCounts[stage] ?? 0;
      const percent = totalLeads ? Number(((count / totalLeads) * 100).toFixed(2)) : 0;
      return {
        status: stage,
        count,
        percent
      };
    });

    const normalizedSourceCounts = leadsBySourceStage.reduce<Record<string, number>>((acc, item) => {
      const key = this.normalizeSource(item.source);
      acc[key] = (acc[key] ?? 0) + item._count._all;
      return acc;
    }, {});

    const sourceStageCounts = leadsBySourceStage.reduce<Record<string, Record<string, number>>>(
      (acc, item) => {
        const source = this.normalizeSource(item.source);
        acc[source] ??= {};
        acc[source][item.stage] = (acc[source][item.stage] ?? 0) + item._count._all;
        return acc;
      },
      {}
    );

    const buildFunnel = (source: string): DashboardSourceFunnel => {
      const total = normalizedSourceCounts[source] ?? 0;
      const stageCountsForSource = sourceStageCounts[source] ?? {};

      const getCount = (stage: LeadStage) => stageCountsForSource[stage] ?? 0;
      const novo = getCount(LeadStage.NOVO);
      const agendou = getCount(LeadStage.AGENDOU_CALL);
      const entrou = getCount(LeadStage.ENTROU_CALL);
      const comprou = getCount(LeadStage.COMPROU);

      const percent = (count: number) => (total ? Number(((count / total) * 100).toFixed(2)) : 0);
      const rate = (num: number, den: number) => (den ? Number(((num / den) * 100).toFixed(2)) : 0);

      return {
        source,
        totalLeads: total,
        stages: stageOrder.map((stage) => ({
          stage,
          count: getCount(stage),
          percent: percent(getCount(stage))
        })),
        conversion: {
          agendouFromNovo: rate(agendou, novo),
          entrouFromAgendou: rate(entrou, agendou),
          comprouFromEntrou: rate(comprou, entrou),
          comprouFromNovo: rate(comprou, novo)
        }
      };
    };

    const origins = Object.entries(normalizedSourceCounts)
      .map(([origin, count]) => ({
        origin,
        count,
        percent: totalLeads ? Number(((count / totalLeads) * 100).toFixed(2)) : 0
      }))
      .sort((a, b) => b.count - a.count);

    return {
      date: range.date,
      totalLeads,
      top5Statuses,
      origins,
      sourceFunnels: [buildFunnel('WhatsApp'), buildFunnel('Instagram')]
    };
  }

  async dashboardSeries(userId: string, endDate?: string, daysInput?: string) {
    const days = Math.max(1, Math.min(31, Number(daysInput ?? 7) || 7));
    const tz = 'America/Sao_Paulo';
    const range = this.resolveDayRange(endDate);

    const rangeEnd = dayjs.tz(range.date, 'YYYY-MM-DD', tz).add(1, 'day').startOf('day');
    const rangeStart = dayjs.tz(range.date, 'YYYY-MM-DD', tz).startOf('day').subtract(days - 1, 'day');

    const rows = await this.prisma.$queryRaw<Array<{ day: string; stage: LeadStage; count: number }>>`
      SELECT (("createdAt" AT TIME ZONE ${tz})::date)::text AS day,
             "stage"::text AS stage,
             COUNT(*)::int AS count
      FROM "Lead"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${rangeStart.toDate()}
        AND "createdAt" < ${rangeEnd.toDate()}
      GROUP BY day, stage
      ORDER BY day ASC;
    `;

    const stageOrder: LeadStage[] = [
      LeadStage.NOVO,
      LeadStage.AGENDOU_CALL,
      LeadStage.ENTROU_CALL,
      LeadStage.COMPROU,
      LeadStage.NO_SHOW
    ];

    const byDay = rows.reduce<Record<string, Record<string, number>>>((acc, row) => {
      acc[row.day] ??= {};
      acc[row.day][row.stage] = (acc[row.day][row.stage] ?? 0) + row.count;
      return acc;
    }, {});

    const series = Array.from({ length: days }, (_, idx) => {
      const day = rangeStart.add(idx, 'day').format('YYYY-MM-DD');
      const stageCounts = byDay[day] ?? {};
      const statuses = stageOrder.map((stage) => ({
        status: stage,
        count: stageCounts[stage] ?? 0
      }));
      const totalLeads = statuses.reduce((sum, item) => sum + item.count, 0);
      return {
        date: day,
        totalLeads,
        statuses
      };
    });

    return {
      startDate: rangeStart.format('YYYY-MM-DD'),
      endDate: range.date,
      days,
      series
    };
  }
}
