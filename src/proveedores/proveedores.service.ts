import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ProveedoresService {
  private readonly logger = new Logger(ProveedoresService.name);

  constructor(private readonly db: DatabaseService) {}

  // 1. Para listar los proveedores en los checkboxes del Front
  async obtenerTodos() {
    try {
      return await this.db.proveedores.findMany({
        select: { id_proveedor: true, nombre_proveedor: true, correo_proveedor: true },
        orderBy: { nombre_proveedor: 'asc' }
      });
    } catch (error) {
      this.logger.error('Error al obtener proveedores:', error);
      throw error;
    }
  }

  // 2. Para cuando el Admin crea un proveedor nuevo desde el formulario
  async crear(nombre: string, correo: string) {
    try {
      return await this.db.proveedores.create({
        data: {
          nombre_proveedor: nombre,
          correo_proveedor: correo
        },
        select: {
          id_proveedor: true,
          nombre_proveedor: true
        }
      });
    } catch (error) {
      this.logger.error('Error al crear proveedor:', error);
      throw error;
    }
  }
}