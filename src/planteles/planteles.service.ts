import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PlantelesService {
  private readonly logger = new Logger(PlantelesService.name);

  constructor(private readonly db: DatabaseService) {}

  async obtenerTodos() {
    try {
      return await this.db.planteles.findMany({
        select: { id_plantel: true, nombre_plantel: true },
        orderBy: { nombre_plantel: 'asc' }
      });
    } catch (error) {
      this.logger.error('Error al obtener todos los planteles:', error);
      throw error;
    }
  }
}