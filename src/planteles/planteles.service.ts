import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service'; // Ajusta la ruta a tu BD

@Injectable()
export class PlantelesService {
  constructor(private readonly db: DatabaseService) {}

  async obtenerTodos() {
    // Traemos el ID y el Nombre para alimentar correctamente el Select/Datalist
    const query = `
      SELECT id_plantel, nombre_plantel 
      FROM Planteles 
      ORDER BY nombre_plantel ASC;
    `;
    const resultado = await this.db.query(query);
    return resultado.rows;
  }
}