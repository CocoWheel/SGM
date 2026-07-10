import { Module } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesController } from './notificaciones.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [NotificacionesService],
  controllers: [NotificacionesController]
})
export class NotificacionesModule {}
