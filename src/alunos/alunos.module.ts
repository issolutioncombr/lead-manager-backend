import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AlunosController } from './alunos.controller';
import { AlunosRepository } from './alunos.repository';
import { AlunosService } from './alunos.service';

@Module({
  imports: [PrismaModule],
  controllers: [AlunosController],
  providers: [AlunosService, AlunosRepository],
  exports: [AlunosService]
})
export class AlunosModule {}

