import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: any) {
    const { correo_usuario, contrasena_usuario } = body;
    return await this.authService.login(correo_usuario, contrasena_usuario);
  }

  @Post('register')
  async register(@Body() body: any) {
    return await this.authService.register(body);
  }
}
