import { Module } from '@nestjs/common';
import { EventosService } from './eventos.service';
import { EventosController } from './eventos.controller';
import { DatabaseModule } from '../database/database.module'; // Para que use tu conexión a Neon
import { MailModule } from '../mail/mail.module'; // Para que pueda enviar correos

@Module({
  imports: [DatabaseModule, MailModule], 
  controllers: [EventosController],
  providers: [EventosService],
})
export class EventosModule {}