import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule'; // 1. Importar el módulo
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MailModule } from './mail/mail.module';
import { EventosModule } from './eventos/eventos.module';
import { PlantelesModule } from './planteles/planteles.module';
import { EspaciosModule } from './espacios/espacios.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { AreasModule } from './areas/areas.module';
import { AuthModule } from './auth/auth.module';
import { MaterialesModule } from './materiales/materiales.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(), // 2. Inicializarlo aquí de forma global
    DatabaseModule,
    MailModule,
    EventosModule,
    PlantelesModule,
    EspaciosModule,
    ProveedoresModule,
    AreasModule,
    AuthModule,
    MaterialesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}