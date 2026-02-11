import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
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
  sellerId?: string;
};

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: LeadsQueryDto): Promise<any> {
    const result = user.sellerId
      ? await this.leadsService.listForSeller(user.userId, user.sellerId, query)
      : await this.leadsService.list(user.userId, query);
    if (query.includeLastMessage) {
      const ids = result.data.map((l) => l.id);
      const latest = await this.leadsService.getLastMessagesForLeads(user.userId, ids);
      return {
        ...result,
        data: result.data.map((l) => ({
          ...l,
          lastMessage: latest[l.id] ?? null
        }))
      };
    }
    return result;
  }

  @Get('export/events/meta-capi')
  async exportMetaCapi(@CurrentUser() user: AuthenticatedUser) {
    if (user.sellerId) throw new ForbiddenException('Somente empresas podem acessar esta funcionalidade');
    return this.leadsService.getMetaCapiEvents(user.userId);
  }

  @Get('export')
  async export(@CurrentUser() user: AuthenticatedUser, @Query() query: LeadsQueryDto, @Res() res: Response) {
    if (user.sellerId) throw new ForbiddenException('Somente empresas podem acessar esta funcionalidade');
    const { filename, content } = await this.leadsService.exportCsv(user.userId, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @Get(':id')
  find(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.leadsService.findByIdForContext(user.userId, id, { sellerId: user.sellerId ?? null });
  }

  @Get(':id/messages')
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: { page?: string; limit?: string; textOnly?: string }
  ) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.max(1, Math.min(200, Number(query.limit ?? 50)));
    const textOnly = (query.textOnly ?? 'false').toLowerCase() === 'true';
    return this.leadsService.getLeadMessagesForContext(
      user.userId,
      id,
      { page, limit, textOnly },
      { sellerId: user.sellerId ?? null }
    );
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeadDto | CreateLeadDto[]) {
    if (user.sellerId) throw new ForbiddenException('Somente empresas podem acessar esta funcionalidade');
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
    if (user.sellerId) throw new ForbiddenException('Somente empresas podem acessar esta funcionalidade');
    return this.leadsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (user.sellerId) throw new ForbiddenException('Somente empresas podem acessar esta funcionalidade');
    return this.leadsService.delete(user.userId, id);
  }
}
