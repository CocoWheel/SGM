import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'El correo debe ser válido' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  correo_usuario!: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  contrasena_usuario!: string;
}
