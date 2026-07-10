import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CrearMaterialDto } from './dto/crear-material.dto';

@Injectable()
export class MaterialesService {
  private readonly logger = new Logger(MaterialesService.name);

  constructor(private readonly db: DatabaseService) {}

  async obtenerTodos() {
    try {
      const materiales = await this.db.materiales.findMany({
        orderBy: { id_material: 'desc' },
      });
      return materiales;
    } catch (error: any) {
      this.logger.error(`Error al obtener materiales: ${error.message}`);
      throw new HttpException(
        'Error al obtener materiales',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async crearMaterial(datos: CrearMaterialDto) {
    try {
      const nuevoMaterial = await this.db.materiales.create({
        data: {
          nombre_material: datos.nombre_material,
          cantidad_material: Number(datos.cantidad_material) || 0,
          imagen_material: datos.imagen_material || null,
        },
      });
      return nuevoMaterial;
    } catch (error: any) {
      this.logger.error(`Error al crear material: ${error.message}`);
      throw new HttpException(
        'Error al crear material',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async eliminarMaterial(id_material: number) {
    try {
      // Verificar si existe y si no está en uso
      const material = await this.db.materiales.findUnique({
        where: { id_material },
        include: { evento_material: true },
      });

      if (!material) {
        throw new HttpException('Material no encontrado', HttpStatus.NOT_FOUND);
      }

      if (material.evento_material && material.evento_material.length > 0) {
        throw new HttpException(
          'No se puede eliminar el material porque está asociado a uno o más eventos',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.db.materiales.delete({
        where: { id_material },
      });

      return { exito: true, mensaje: 'Material eliminado exitosamente' };
    } catch (error: any) {
      this.logger.error(`Error al eliminar material: ${error.message}`);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Error al eliminar material',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
