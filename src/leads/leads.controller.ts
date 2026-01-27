import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { PaginatedLeads } from './leads.repository';
import { LeadsService } from './leads.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
};

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: LeadsQueryDto): Promise<PaginatedLeads> {
    return this.leadsService.list(user.userId, query);
  }

  @Get('export/events/meta-capi')
  async exportMetaCapi(@CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.getMetaCapiEvents(user.userId);
  }

  @Get('export')
  async export(@CurrentUser() user: AuthenticatedUser, @Query() query: LeadsQueryDto, @Res() res: Response) {
    const { filename, content } = await this.leadsService.exportCsv(user.userId, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @Get(':id')
  find(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leadsService.findById(user.userId, id);
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeadDto | CreateLeadDto[]) {
    if (Array.isArray(dto)) {
      // Se for um array, processa o primeiro item (ou itera, dependendo da regra de negócio)
      // O N8N pode enviar um array se o nó anterior retornar múltiplos itens e "Split In Batches" não for usado
      // Assumindo criação individual por enquanto, pegamos o primeiro.
      // Se quiser suportar bulk insert real, precisaria de um serviço específico.
      return this.leadsService.create(user.userId, dto[0]);
    }
    return this.leadsService.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leadsService.delete(user.userId, id);
  }
}
