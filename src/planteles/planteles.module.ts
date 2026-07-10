import { Module } from '@nestjs/common';
import { PlantelesService } from './planteles.service';
import { PlantelesController } from './planteles.controller';

@Module({
  controllers: [PlantelesController],
  providers: [PlantelesService],
})
export class PlantelesModule {}
