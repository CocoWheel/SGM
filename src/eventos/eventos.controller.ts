import { Controller, Post, Body } from '@nestjs/common';
import { EventosService } from './eventos.service';

@Controller('eventos')
export class EventosController {
  constructor(private readonly eventosService: EventosService) {}

  @Post('agendar')
  async crearEvento(@Body() datosFormulario: any) {
    // Recibe el JSON del frontend y se lo pasa al servicio
    return await this.eventosService.agendarYNotificar(datosFormulario);
  }
}