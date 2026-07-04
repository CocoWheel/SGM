import { Controller, Get, Post, Body } from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';
import { CrearProveedorDto } from './dto/crear-proveedor.dto';

@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Get()
  async obtenerTodos() {
    return await this.proveedoresService.obtenerTodos();
  }

  @Post()
  async crear(@Body() dto: CrearProveedorDto) {
    return await this.proveedoresService.crear(
      dto.nombre_proveedor, 
      dto.correo_proveedor || '', 
      dto.telefono_proveedor || '', 
      dto.servicio_proveedor || ''
    );
  }
}
