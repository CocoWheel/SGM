import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ProveedoresService {
  constructor(private readonly db: DatabaseService) {}

  // 1. Para listar los proveedores en los checkboxes del Front
  async obtenerTodos() {
    const query = `
      SELECT id_proveedor, nombre_proveedor, correo_proveedor 
      FROM Proveedores 
      ORDER BY nombre_proveedor ASC;
    `;
    const resultado = await this.db.query(query);
    return resultado.rows;
  }

  // 2. Para cuando el Admin crea un proveedor nuevo desde el formulario
  async crear(nombre: string, correo: string) {
    const query = `
      INSERT INTO Proveedores (nombre_proveedor, correo_proveedor) 
      VALUES ($1, $2) 
      RETURNING id_proveedor, nombre_proveedor;
    `;
    const resultado = await this.db.query(query, [nombre, correo]);
    return resultado.rows[0]; // Regresa el objeto creado con su ID para el Front
  }
}