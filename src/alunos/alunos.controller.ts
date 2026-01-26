import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AlunosService } from './alunos.service';
import { PaginatedAlunos } from './alunos.repository';
import { CreateAlunoDto } from './dto/create-aluno.dto';
import { UpdateAlunoDto } from './dto/update-aluno.dto';

type AuthenticatedUser = {
  userId: string;
  email: string;
};

@Controller('alunos')
export class AlunosController {
  constructor(private readonly alunosService: AlunosService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto): Promise<PaginatedAlunos> {
    return this.alunosService.list(user.userId, query);
  }

  @Get(':id')
  find(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.alunosService.findById(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAlunoDto) {
    return this.alunosService.create(user.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateAlunoDto) {
    return this.alunosService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.alunosService.delete(user.userId, id);
  }
}
