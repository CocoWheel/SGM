import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class NotificacionesService {
  constructor(private readonly db: DatabaseService) {}

  async obtenerNotificacionesDeUsuario(id_usuario: number) {
    return await this.db.notificaciones.findMany({
      where: { id_usuario },
      orderBy: { fechaenvio_notificacion: 'desc' },
      take: 20
    });
  }

  async marcarTodasComoLeidas(id_usuario: number) {
    return await this.db.notificaciones.updateMany({
      where: { 
        id_usuario,
        estatus_notificacion: 'Pendiente'
      },
      data: {
        estatus_notificacion: 'Leida'
      }
    });
  }
}
