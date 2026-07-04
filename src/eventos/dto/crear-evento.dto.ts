import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CrearEventoDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del evento es obligatorio' })
  nombre!: string;

  @IsString()
  @IsOptional()
  comentarios?: string;

  @IsString()
  @IsNotEmpty({ message: 'El objetivo es obligatorio' })
  objetivo!: string;

  @IsString()
  @IsOptional()
  publicoobjetivo_eventos?: string;

  @IsString()
  @IsNotEmpty({ message: 'La fecha es obligatoria' })
  fecha!: string;

  @IsString()
  @IsNotEmpty({ message: 'La hora de inicio es obligatoria' })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'La hora debe tener el formato HH:MM' })
  hora!: string;

  @IsString()
  @IsNotEmpty({ message: 'La hora de fin es obligatoria' })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'La hora fin debe tener el formato HH:MM' })
  horaFin!: string;

  @IsString()
  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'La hora de preparación debe tener el formato HH:MM' })
  horaApartado?: string;

  @IsString()
  @IsOptional()
  prioridad?: string;

  @IsInt()
  @IsNotEmpty({ message: 'El id_usuario es obligatorio' })
  id_usuario!: number;

  @IsString()
  @IsNotEmpty({ message: 'El plantel es obligatorio' })
  plantel!: string;

  @IsString()
  @IsNotEmpty({ message: 'El área o espacio es obligatorio' })
  area!: string;

  @IsInt()
  @IsOptional()
  id_area_solicitante?: number;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  ids_areas_apoyo?: number[];
}
