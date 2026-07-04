import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Remueve los campos que no estén en los DTOs
    forbidNonWhitelisted: true, // Lanza error si envían propiedades no definidas en el DTO
    transform: true // Transforma automáticamente los payloads a las instancias de las clases DTO
  }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
