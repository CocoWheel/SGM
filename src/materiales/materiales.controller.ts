import { Controller, Get, Post, Body, Delete, Param, ParseIntPipe } from '@nestjs/common';
import { MaterialesService } from './materiales.service';
import { CrearMaterialDto } from './dto/crear-material.dto';

@Controller('materiales')
export class MaterialesController {
  constructor(private readonly materialesService: MaterialesService) {}

  @Get()
  async obtenerTodos() {
    return await this.materialesService.obtenerTodos();
  }

  @Post()
  async crearMaterial(@Body() datos: CrearMaterialDto) {
    return await this.materialesService.crearMaterial(datos);
  }

  @Delete(':id')
  async eliminarMaterial(@Param('id', ParseIntPipe) id: number) {
    return await this.materialesService.eliminarMaterial(id);
  }
}
