import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Appointment, AppointmentStatus, Prisma } from '@prisma/client';

import { LeadsService } from '../leads/leads.service';
import { parseDateInput } from '../common/utils/date.util';
import { AppointmentsRepository, PaginatedAppointments } from './appointments.repository';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsDto } from './dto/list-appointments.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { SellerVideoCallAccessService } from '../sellers/seller-video-call-access.service';

type AuthenticatedActor = {
  userId: string;
  sellerId?: string;
};

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly appointmentsRepository: AppointmentsRepository,
    private readonly leadsService: LeadsService,
    private readonly access: SellerVideoCallAccessService
  ) {}

  async list(actor: AuthenticatedActor, query: ListAppointmentsDto): Promise<PaginatedAppointments> {
    if (actor.sellerId) {
      const scope = await this.access.requireActiveLeadScope(actor.userId, actor.sellerId);
      return this.appointmentsRepository.findMany(actor.userId, {
        ...query,
        ...(scope.appointmentId ? { appointmentId: scope.appointmentId } : { leadId: scope.leadId })
      });
    }

    return this.appointmentsRepository.findMany(actor.userId, query);
  }

  async findById(actor: AuthenticatedActor, id: string) {
    if (actor.sellerId) {
      const scope = await this.access.requireActiveLeadScope(actor.userId, actor.sellerId);
      const appointment = await this.appointmentsRepository.findById(actor.userId, id);
      if (!appointment) {
        throw new NotFoundException('Consulta nao encontrada');
      }
      if (scope.appointmentId) {
        if (appointment.id !== scope.appointmentId) throw new ForbiddenException('Acesso negado');
      } else {
        if (appointment.leadId !== scope.leadId) throw new ForbiddenException('Acesso negado');
      }
      return appointment;
    }

    const appointment = await this.appointmentsRepository.findById(actor.userId, id);

    if (!appointment) {
      throw new NotFoundException('Consulta nao encontrada');
    }

    return appointment;
  }

  async create(actor: AuthenticatedActor, dto: CreateAppointmentDto): Promise<Appointment> {
    this.access.ensureCompanyUser(actor);
    await this.leadsService.findById(actor.userId, dto.leadId);
    const status = dto.status ?? AppointmentStatus.AGENDADA;
    const start = parseDateInput(dto.start);
    const end = parseDateInput(dto.end);
    const appointment = await this.appointmentsRepository.create(actor.userId, {
      leadId: dto.leadId,
      start,
      end,
      status,
      meetLink: dto.meetLink ?? null,
      googleEventId: dto.googleEventId ?? null
    });

    return appointment;
  }

  async update(actor: AuthenticatedActor, id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    this.access.ensureCompanyUser(actor);
    const appointment = await this.findById(actor, id);
    const status = dto.status ?? appointment.status;
    if (dto.leadId) {
      await this.leadsService.findById(actor.userId, dto.leadId);
    }

    const data: Prisma.AppointmentUpdateInput = {
      status,
      start: dto.start ? parseDateInput(dto.start) : undefined,
      end: dto.end ? parseDateInput(dto.end) : undefined,
      meetLink: dto.meetLink ?? undefined,
      googleEventId: dto.googleEventId ?? undefined
    };

    if (dto.leadId) {
      data.lead = { connect: { id: dto.leadId } };
    }

    const updatedAppointment = await this.appointmentsRepository.update(id, data);

    if (dto.leadStage) {
      const targetLeadId = dto.leadId ?? appointment.leadId;
      await this.leadsService.update(
        actor.userId,
        targetLeadId,
        { stage: dto.leadStage },
        { relatedAppointment: updatedAppointment }
      );
    }

    return updatedAppointment;
  }

  async delete(actor: AuthenticatedActor, id: string): Promise<Appointment> {
    this.access.ensureCompanyUser(actor);
    await this.findById(actor, id);
    return this.appointmentsRepository.delete(id);
  }
}
