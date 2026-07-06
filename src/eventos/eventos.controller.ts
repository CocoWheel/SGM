import { Controller, Post, Body, Get, Query, Res, Patch, Param, ParseIntPipe, Delete } from '@nestjs/common';
import { EventosService } from './eventos.service';
import { CrearEventoDto } from './dto/crear-evento.dto';

@Controller('eventos')
export class EventosController {
  constructor(private readonly eventosService: EventosService) {}

  // 1. Quitamos 'agendar' para que escuche directamente en http://localhost:3000/eventos
  @Post() 
  async crearEvento(@Body() datosFormulario: CrearEventoDto) {
    // Recibe el JSON validado y se lo pasa al servicio
    return await this.eventosService.agendarYNotificar(datosFormulario);
  }

  @Patch(':id')
  async editarEvento(
    @Param('id', ParseIntPipe) id_evento: number,
    @Body() datosFormulario: CrearEventoDto
  ) {
    return await this.eventosService.actualizarEvento(id_evento, datosFormulario);
  }

  @Delete(':id')
  async eliminarEvento(@Param('id', ParseIntPipe) id_evento: number) {
    return await this.eventosService.eliminarEvento(id_evento);
  }

  @Get()
  async obtenerEventos(@Query('id_usuario') id_usuario?: string) {
    const idUsuarioNum = id_usuario ? parseInt(id_usuario) : undefined;
    return await this.eventosService.obtenerTodos(idUsuarioNum);
  }

  @Patch(':id/cobertura')
  async asignarCobertura(
    @Param('id', ParseIntPipe) id_evento: number,
    @Body() data: { proveedoresIds: number[], id_usuario: number }
  ) {
    return await this.eventosService.asignarCobertura(id_evento, data.proveedoresIds, data.id_usuario);
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


  /**
   * 2. Genera la URL oficial de Google para iniciar sesión.
   * Tu Frontend pasará el ID del usuario logueado en la app: GET http://localhost:3000/eventos/google/url?id_usuario=5
   */
  @Get('google/url')
  obtenerUrlGoogle(@Query('id_usuario') id_usuario: string) {
    const idUsuarioNum = id_usuario ? parseInt(id_usuario) : 1;
    const url = this.eventosService.generarUrlAutenticacionGoogle(idUsuarioNum);
    return { url };
  }

  /**
   * 3. Callback de Google. Aquí regresa el control con el código y el state (id_usuario).
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

      // Una vez guardado todo con éxito, mandamos al usuario de vuelta a la interfaz del Frontend
      return res.redirect('http://localhost:5173/dashboard?google=success');
    } catch (error: any) {
      // Si algo falla, redirige con un parámetro de error para avisarle al usuario
      return res.redirect('http://localhost:5173/dashboard?google=error');
    }
  }
}