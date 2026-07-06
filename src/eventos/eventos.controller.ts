import { Controller, Post, Body, Get, Query, Res, Patch, Param, ParseIntPipe, Delete } from '@nestjs/common';
import { EventosService } from './eventos.service';

@Controller('eventos')
export class EventosController {
  constructor(private readonly eventosService: EventosService) {}

  // 1. Crear un evento desde el formulario del Frontend
  @Post() 
  async crearEvento(@Body() datosFormulario: any) {
    return await this.eventosService.agendarYNotificar(datosFormulario);
  }

  @Get('dashboard/stats')
  async obtenerEstadisticasDashboard() {
    return await this.eventosService.obtenerEstadisticasDashboard();
  }

  @Post(':id/asistencia')
  async registrarAsistencia(
    @Param('id', ParseIntPipe) id_evento: number,
    @Body() datos: any
  ) {
    return await this.eventosService.registrarAsistencia(id_evento, datos);
  }

  @Post(':id/encuesta')
  async registrarEncuesta(
    @Param('id', ParseIntPipe) id_evento: number,
    @Body() datos: any
  ) {
    return await this.eventosService.registrarEncuesta(id_evento, datos);
  }

  @Get(':id/reporte')
  async obtenerReporteEvento(@Param('id', ParseIntPipe) id_evento: number) {
    return await this.eventosService.obtenerReporteEvento(id_evento);
  }

  // 2. Editar un evento existente
  @Patch(':id')
  async editarEvento(
    @Param('id', ParseIntPipe) id_evento: number,
    @Body() datosFormulario: any
  ) {
    return await this.eventosService.actualizarEvento(id_evento, datosFormulario);
  }

  // 3. Obtener todos los eventos (opcionalmente por usuario)
  @Get()
  async obtenerEventos(@Query('id_usuario') id_usuario?: string) {
    const idUsuarioNum = id_usuario ? parseInt(id_usuario) : undefined;
    return await this.eventosService.obtenerTodos(idUsuarioNum);
  }

  // 4. Asignar cobertura de proveedores a un evento
  @Patch(':id/cobertura')
  async asignarCobertura(
    @Param('id', ParseIntPipe) id_evento: number,
    @Body() data: { proveedoresIds: number[], id_usuario: number, prioridad?: string, estatus?: string }
  ) {
    return await this.eventosService.asignarCobertura(id_evento, data.proveedoresIds, data.id_usuario, data.prioridad, data.estatus);
  }

  /**
   * 5. Genera la URL oficial de Google para iniciar sesión.
   * Tu Frontend pasará el ID del usuario logueado en la app: GET http://localhost:3000/eventos/google/url?id_usuario=5
   */
  @Get('google/url')
  obtenerUrlGoogle(@Query('id_usuario') id_usuario: string) {
    const idUsuarioNum = id_usuario ? parseInt(id_usuario) : 1;
    const url = this.eventosService.generarUrlAutenticacionGoogle(idUsuarioNum);
    return { url };
  }

  /**
   * 6. Callback de Google. Aquí regresa el control con el código y el state (id_usuario).
   */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string, 
    @Query('state') state: string, // Google nos devuelve aquí el id_usuario que inyectamos
    @Res() res: any
  ) {
    try {
      // Tomamos el código temporal y lo intercambiamos por tokens definitivos
      const tokens = await this.eventosService.intercambiarCodigoPorTokens(code);
      
      // Guardamos esos tokens usando el id_usuario real que viene en el 'state'
      const idUsuario = state ? parseInt(state) : 1;
      await this.eventosService.guardarTokensDeUsuario(idUsuario, tokens); 

      // Redirige a la ruta correcta del Dashboard en el Frontend
      return res.redirect('http://localhost:5173/eventos/dashboard?google=success');
    } catch (error: any) {
      // Redirige indicando el fallo en caso de error
      return res.redirect('http://localhost:5173/eventos/dashboard?google=error');
    }
  }
}