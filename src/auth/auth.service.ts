import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(private readonly databaseService: DatabaseService) {}

  async login(correo_usuario: string, contrasena_usuario: string) {
    try {
      const user = await this.databaseService.usuarios.findUnique({
        where: { correo_usuario },
        include: { usuario_rol: { include: { roles: true } } } 
      });

      if (!user) {
        throw new HttpException('Usuario no encontrado', HttpStatus.UNAUTHORIZED);
      }

      if (user.contrasena_usuario !== contrasena_usuario) {
        throw new HttpException('Credenciales inválidas', HttpStatus.UNAUTHORIZED);
      }

      // @ts-ignore
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

  async register(data: RegisterDto) {
    try {
      const exist = await this.databaseService.usuarios.findUnique({
        where: { correo_usuario: data.correo_usuario }
      });

      if (exist) {
        throw new HttpException('El correo ya está en uso', HttpStatus.BAD_REQUEST);
      }

      const user = await this.databaseService.usuarios.create({
        data: {
          nombre_usuario: data.nombre_usuario,
          apellidop_usuario: data.apellidop_usuario,
          apellidom_usuario: data.apellidom_usuario,
          correo_usuario: data.correo_usuario,
          contrasena_usuario: data.contrasena_usuario,
          telefono_usuario: data.telefono_usuario,
          usuario_rol: {
            create: {
              id_rol: data.id_rol
            }
          }
        },
        include: { usuario_rol: { include: { roles: true } } }
      });

      // @ts-ignore
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
