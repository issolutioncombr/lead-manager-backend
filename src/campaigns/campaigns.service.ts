import { Injectable, NotFoundException } from '@nestjs/common';
import { Campaign, CampaignStatus, Prisma } from '@prisma/client';

import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CampaignsRepository, PaginatedCampaigns } from './campaigns.repository';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly campaignsRepository: CampaignsRepository) {}

  list(userId: string, query: PaginationQueryDto): Promise<PaginatedCampaigns> {
    return this.campaignsRepository.findMany(userId, query);
  }

  async findById(userId: string, id: string) {
    const campaign = await this.campaignsRepository.findById(userId, id);

    if (!campaign) {
      throw new NotFoundException('Campanha nao encontrada');
    }

    return campaign;
  }

  create(userId: string, dto: CreateCampaignDto): Promise<Campaign> {
    return this.campaignsRepository.create(userId, {
      name: dto.name,
      channel: dto.channel,
      message: dto.message,
      imageUrl: dto.imageUrl ?? null,
      status: dto.status ?? CampaignStatus.DRAFT,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined
    });
  }

  async update(userId: string, id: string, dto: UpdateCampaignDto): Promise<Campaign> {
    await this.findById(userId, id);

    const updateData: Prisma.CampaignUpdateInput = {
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined
    };

    if (Object.prototype.hasOwnProperty.call(dto, 'imageUrl')) {
      updateData.imageUrl = dto.imageUrl ?? null;
    }

    return this.campaignsRepository.update(id, updateData);
  }

  async delete(userId: string, id: string): Promise<Campaign> {
    await this.findById(userId, id);
    return this.campaignsRepository.delete(id);
  }

  async send(userId: string, id: string) {
    const campaign = await this.findById(userId, id);
    const sentAt = new Date();
    const status =
      campaign.status === CampaignStatus.COMPLETED ? CampaignStatus.COMPLETED : CampaignStatus.ACTIVE;

    await this.campaignsRepository.update(id, {
      status,
      scheduledAt: campaign.scheduledAt ?? sentAt
    });

    const message = `Campanha enviada via ${campaign.channel} em ${sentAt.toISOString()}`;
    await this.campaignsRepository.createLog(id, message);

    return {
      campaignId: id,
      sentAt,
      message
    };
  }
}
