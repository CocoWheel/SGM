import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CrearMaterialDto {
  @IsString()
  nombre_material: string;

  @IsNumber()
  cantidad_material: number;

  @IsOptional()
  @IsString()
  imagen_material?: string;
}
