import { Controller, Get } from '@nestjs/common';
import { PlantelesService } from './planteles.service';

@Controller('planteles')
export class PlantelesController {
  constructor(private readonly plantelesService: PlantelesService) {}

  @Get()
  async listarPlanteles() {
    return await this.plantelesService.obtenerTodos();
  }
}