import { Controller, Get } from '@nestjs/common';
import { EspaciosService } from './espacios.service';

@Controller('espacios')
export class EspaciosController {
  constructor(private readonly espaciosService: EspaciosService) {}

  @Get()
  async listarEspacios() {
    return await this.espaciosService.obtenerTodos();
  }
}