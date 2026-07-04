import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class EspaciosService {
  private readonly logger = new Logger(EspaciosService.name);

  constructor(private readonly db: DatabaseService) {}

  async obtenerTodos() {
    try {
      return await this.db.espacios.findMany({
        select: { id_espacio: true, nombre_espacio: true, id_plantel: true },
        orderBy: { nombre_espacio: 'asc' }
      });
    } catch (error) {
      this.logger.error('Error al obtener todos los espacios:', error);
      throw error;
    }
  }
}