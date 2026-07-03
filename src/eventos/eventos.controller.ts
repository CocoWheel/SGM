import { Controller, Post, Body, Get, Query, Res } from '@nestjs/common'; //  Agregamos Get, Query y Res
import { EventosService } from './eventos.service';
import { Response } from 'express'; //  Importación necesaria para el redireccionamiento corporativo

@Controller('eventos')
export class EventosController {
  constructor(private readonly eventosService: EventosService) {}

  @Post('agendar')
  async crearEvento(@Body() datosFormulario: any) {
    // Recibe el JSON del frontend y se lo pasa al servicio
    return await this.eventosService.agendarYNotificar(datosFormulario);
  }

  /**
   * 1. Genera la URL oficial de Google para iniciar sesión.
   * Tu Frontend pasará el ID del usuario logueado en la app: GET http://localhost:3000/eventos/google/url?id_usuario=5
   */
  @Get('google/url')
  obtenerUrlGoogle(@Query('id_usuario') id_usuario: string) {
    const idUsuarioNum = id_usuario ? parseInt(id_usuario) : 1;
    const url = this.eventosService.generarUrlAutenticacionGoogle(idUsuarioNum);
    return { url };
  }

  /**
   * 2. Callback de Google. Aquí regresa el control con el código y el state (id_usuario).
   */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string, 
    @Query('state') state: string, //  Google nos devuelve aquí el id_usuario que inyectamos
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