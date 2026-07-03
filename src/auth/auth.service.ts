import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthService {
  constructor(private readonly databaseService: DatabaseService) {}

  async login(correo_usuario: string, contrasena_usuario: string) {
    try {
      const result = await this.databaseService.query(
        'SELECT * FROM usuarios WHERE correo_usuario = $1',
        [correo_usuario],
      );

      const user = result.rows[0];

      if (!user) {
        throw new HttpException('Usuario no encontrado', HttpStatus.UNAUTHORIZED);
      }

      if (user.contrasena_usuario !== contrasena_usuario) {
        throw new HttpException('Credenciales inválidas', HttpStatus.UNAUTHORIZED);
      }

      delete user.contrasena_usuario;

      return {
        message: 'Login exitoso',
        user: user,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error en login:', error);
      throw new HttpException('Error de servidor', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async register(data: any) {
    try {
      // Verificar si el usuario ya existe
      const exist = await this.databaseService.query(
        'SELECT * FROM usuarios WHERE correo_usuario = $1',
        [data.correo_usuario],
      );

      if (exist.rows.length > 0) {
        throw new HttpException('El correo ya está en uso', HttpStatus.BAD_REQUEST);
      }

      // Insertar nuevo usuario
      const insertQuery = `
        INSERT INTO usuarios (
          nombre_usuario, apellidop_usuario, apellidom_usuario, 
          correo_usuario, contrasena_usuario, telefono_usuario, id_rol
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
      `;
      const values = [
        data.nombre_usuario,
        data.apellidop_usuario,
        data.apellidom_usuario,
        data.correo_usuario,
        data.contrasena_usuario,
        data.telefono_usuario,
        data.id_rol
      ];

      const result = await this.databaseService.query(insertQuery, values);
      const user = result.rows[0];
      delete user.contrasena_usuario;

      return {
        message: 'Cuenta creada exitosamente',
        user: user,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error en register:', error);
      throw new HttpException('Error al crear usuario', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
