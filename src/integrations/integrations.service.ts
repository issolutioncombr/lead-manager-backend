import { Injectable } from '@nestjs/common';
import { ClientStatus, LeadStage } from '@prisma/client';

import { ClientsService } from '../clients/clients.service';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleFormsPayloadDto } from './dto/google-forms.dto';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly leadsService: LeadsService,
    private readonly prisma: PrismaService
  ) {}

  async syncGoogleForms(userId: string, payload: GoogleFormsPayloadDto) {
    const tagsFromPayload = Array.from(
      new Set(
        [
          ...(((payload.tags ?? []).filter(Boolean) as string[]) || []),
          ...(payload.interest ? [payload.interest] : [])
        ]
          .map((t) => (typeof t === 'string' ? t.trim() : t))
          .filter(Boolean) as string[]
      )
    );

    let client =
      (payload.email && (await this.clientsService.findByEmail(userId, payload.email))) ||
      (payload.phone && (await this.clientsService.findByPhone(userId, payload.phone))) ||
      null;

    if (!client) {
      client = await this.clientsService.create(userId, {
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        source: payload.source ?? 'WhatsApp',
        tags: tagsFromPayload,
        status: ClientStatus.NEW,
        notes: payload.notes,
        age: payload.age,
        country: payload.country,
        birthDate: payload.birthDate,
        language: payload.language,
        anamnesisResponses: payload.anamnesisResponses
      });
    } else {
      const mergedTags = Array.from(new Set([...(client.tags ?? []), ...tagsFromPayload]));
      await this.clientsService.update(userId, client.id, {
        name: payload.name ?? client.name,
        email: payload.email ?? client.email ?? undefined,
        phone: payload.phone ?? client.phone ?? undefined,
        source: payload.source ?? client.source ?? 'WhatsApp',
        tags: mergedTags,
        notes: payload.notes ?? client.notes ?? undefined,
        age: payload.age,
        country: payload.country,
        birthDate: payload.birthDate,
        language: payload.language,
        anamnesisResponses: payload.anamnesisResponses
      });

      client = await this.clientsService.findById(userId, client.id);
    }

    const lead = await this.leadsService.create(userId, {
      name: payload.name ?? client.name,
      email: payload.email ?? client.email ?? undefined,
      contact: payload.phone ?? client.phone ?? undefined,
      source: payload.source ?? 'WhatsApp',
      notes: payload.notes,
      stage: payload.stage ?? LeadStage.NOVO
    });

    const previousTreatmentValue = this.normalizeBoolean(
      payload.anamnesisResponses?.['Já realizou um tratamento estético anteriormente?'] ??
        payload.anamnesisResponses?.['Ja realizou um tratamento estetico anteriormente?'] ??
        payload.anamnesisResponses?.['Já realizou um tratamento estetico anteriormente?']
    );

    const originalResponses = payload.anamnesisResponses
      ? (payload.anamnesisResponses as Record<string, unknown>)
      : JSON.parse(JSON.stringify(payload));

    const anamnesisRecord = await this.prisma.anamnesisRecord.create({
      data: {
        name: payload.name,
        age: payload.age ?? null,
        country: payload.country ?? null,
        birthDate: payload.birthDate ? new Date(payload.birthDate) : null,
        language: payload.language ?? null,
        phone: payload.phone ?? null,
        email: payload.email ?? null,
        interest: payload.interest ?? null,
        previousAestheticTreatment: previousTreatmentValue ?? undefined,
        originalResponses,
        userId
      }
    });

    return {
      client,
      lead,
      anamnesisRecord
    };
  }

  private normalizeBoolean(value: unknown): boolean | null {
    if (Array.isArray(value)) {
      return this.normalizeBoolean(value[0]);
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['sim', 's', 'yes', 'y', 'verdadeiro', 'true'].includes(normalized)) {
        return true;
      }
      if (['nao', 'não', 'n', 'no', 'false', 'f'].includes(normalized)) {
        return false;
      }
    }

    return null;
  }
}


