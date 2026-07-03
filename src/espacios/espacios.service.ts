import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class EspaciosService {
  constructor(private readonly db: DatabaseService) {}

  async obtenerTodos() {
    const query = `
      SELECT id_espacio, nombre_espacio, id_plantel 
      FROM Espacios 
      ORDER BY nombre_espacio ASC;
    `;
    const resultado = await this.db.query(query);
    return resultado.rows;
  }
}