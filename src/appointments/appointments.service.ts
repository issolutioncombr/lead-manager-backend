import { Injectable, NotFoundException } from '@nestjs/common';
import { Appointment, AppointmentStatus, Prisma } from '@prisma/client';

import { LeadsService } from '../leads/leads.service';
import { parseDateInput } from '../common/utils/date.util';
import { AppointmentsRepository, PaginatedAppointments } from './appointments.repository';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsDto } from './dto/list-appointments.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly appointmentsRepository: AppointmentsRepository,
    private readonly leadsService: LeadsService
  ) {}

  list(userId: string, query: ListAppointmentsDto): Promise<PaginatedAppointments> {
    return this.appointmentsRepository.findMany(userId, query);
  }

  async findById(userId: string, id: string) {
    const appointment = await this.appointmentsRepository.findById(userId, id);

    if (!appointment) {
      throw new NotFoundException('Consulta nao encontrada');
    }

    return appointment;
  }

  async create(userId: string, dto: CreateAppointmentDto): Promise<Appointment> {
    await this.leadsService.findById(userId, dto.leadId);
    const status = dto.status ?? AppointmentStatus.AGENDADA;
    const start = parseDateInput(dto.start);
    const end = parseDateInput(dto.end);
    const appointment = await this.appointmentsRepository.create(userId, {
      leadId: dto.leadId,
      start,
      end,
      status,
      meetLink: dto.meetLink ?? null,
      googleEventId: dto.googleEventId ?? null
    });

    return appointment;
  }

  async update(userId: string, id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    const appointment = await this.findById(userId, id);
    const status = dto.status ?? appointment.status;
    if (dto.leadId) {
      await this.leadsService.findById(userId, dto.leadId);
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
        userId,
        targetLeadId,
        { stage: dto.leadStage },
        { relatedAppointment: updatedAppointment }
      );
    }

    return updatedAppointment;
  }

  async delete(userId: string, id: string): Promise<Appointment> {
    await this.findById(userId, id);
    return this.appointmentsRepository.delete(id);
  }
}
