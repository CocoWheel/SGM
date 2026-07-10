import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Remueve los campos que no estén en los DTOs
    forbidNonWhitelisted: true, // Lanza error si envían propiedades no definidas en el DTO
    transform: true // Transforma automáticamente los payloads a las instancias de las clases DTO
  }));
  
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
