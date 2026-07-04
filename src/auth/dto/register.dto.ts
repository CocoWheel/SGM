import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsArray, IsInt } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  nombre_usuario!: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido paterno es obligatorio' })
  apellidop_usuario!: string;

  @IsString()
  @IsOptional()
  apellidom_usuario?: string;

  @IsEmail({}, { message: 'El correo debe ser válido' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  correo_usuario!: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  contrasena_usuario!: string;

  @IsString()
  @IsOptional()
  telefono_usuario?: string;

  @IsInt()
  @IsNotEmpty({ message: 'El id_rol es obligatorio' })
  id_rol!: number;
}
