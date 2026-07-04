import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CrearProveedorDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del proveedor es obligatorio' })
  nombre_proveedor!: string;

  @IsEmail({}, { message: 'El correo debe ser válido' })
  @IsOptional()
  correo_proveedor?: string;
}
