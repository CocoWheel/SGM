import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule'; // 1. Importar el módulo
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MailModule } from './mail/mail.module';
import { EventosModule } from './eventos/eventos.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(), // 2. Inicializarlo aquí de forma global
    DatabaseModule,
    MailModule,
    EventosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}