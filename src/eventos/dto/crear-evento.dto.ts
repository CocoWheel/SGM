import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
  proveedoresIds?: number[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InvitadoDto)
  invitados?: InvitadoDto[];

  @IsString()
  @IsOptional()
  fotografiaResena?: string;

  @IsString()
  @IsOptional()
  apoyoAcceso?: string;

  @IsString()
  @IsOptional()
  apoyoMantenimiento?: string;

  @IsString()
  @IsOptional()
  Mantenimiento?: string;

  @IsString()
  @IsOptional()
  apoyoAudiovisual?: string;

  @IsOptional()
  equiposAudiovisuales?: any;

  @IsString()
  @IsOptional()
  estatus?: string;

  @IsString()
  @IsOptional()
  responsable?: string;

  @IsString()
  @IsOptional()
  publico?: string;
}

export class InvitadoDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  apellidoPaterno?: string;

  @IsString()
  @IsOptional()
  apellidoMaterno?: string;

  @IsString()
  @IsOptional()
  correo?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsString()
  @IsOptional()
  institucion?: string;

  @IsString()
  @IsOptional()
  nivelAutoridad?: string;
}
