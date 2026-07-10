import { Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get('usuario/:id')
  async obtenerNotificaciones(@Param('id', ParseIntPipe) id_usuario: number) {
    return await this.notificacionesService.obtenerNotificacionesDeUsuario(id_usuario);
  }

  @Patch('usuario/:id/leidas')
  async marcarComoLeidas(@Param('id', ParseIntPipe) id_usuario: number) {
    return await this.notificacionesService.marcarTodasComoLeidas(id_usuario);
  }
}
