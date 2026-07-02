import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
import { Cron, CronExpression } from '@nestjs/schedule'; // ⏰ Importación necesaria para el programador

@Injectable()
export class EventosService {
  private readonly logger = new Logger(EventosService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly mailService: MailService,
  ) {}

  async agendarYNotificar(datosFormulario: any) {
    const { 
      nombre_evento, descripcion_evento, objetivo_evento, publicoobjetivo_eventos,
      fecha_evento, horainicio_evento, horafin_evento, horapreparacion_evento,
      id_prioridad, id_estatus_evento, id_usuario, id_plantel, id_espacio, id_area_solicitante,
      ids_areas_apoyo // <-- Arreglo de IDs de áreas de apoyo elegidas en el formulario: [1, 3, 4]
    } = datosFormulario;

    // 1. Insertar el Evento Principal en la tabla 'Eventos'
    const sqlEvento = `
      INSERT INTO Eventos (
        nombre_evento, descripcion_evento, objetivo_evento, publicoobjetivo_eventos,
        fecha_evento, horainicio_evento, horafin_evento, horapreparacion_evento,
        id_prioridad, id_estatus_evento, id_usuario, id_plantel, id_espacio, id_area_solicitante
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const resEvento = await this.db.query(sqlEvento, [
      nombre_evento, descripcion_evento, objetivo_evento, publicoobjetivo_eventos,
      fecha_evento, horainicio_evento, horafin_evento, horapreparacion_evento,
      id_prioridad, id_estatus_evento, id_usuario, id_plantel, id_espacio, id_area_solicitante
    ]);
    const nuevoEvento = resEvento.rows[0];

    // 2. Insertar las áreas de apoyo elegidas en la tabla intermedia 'Evento_Area'
    if (ids_areas_apoyo && ids_areas_apoyo.length > 0) {
      for (const id_area of ids_areas_apoyo) {
        await this.db.query(
          `INSERT INTO Evento_Area (id_evento, id_area, estatus_eventoa) VALUES ($1, $2, 'Pendiente')`,
          [nuevoEvento.id_evento, id_area]
        );
      }
    }

    this.logger.log(`💾 Evento e intermedias guardados con éxito en Neon. ID: ${nuevoEvento.id_evento}`);

    // 3. Disparar el flujo de correos en segundo plano jalando los datos de la BD
    this.ejecutarFlujoCorreosDinamico(nuevoEvento.id_evento).catch((err: any) => { // Tipado :any agregado
      this.logger.error(`❌ Error en el proceso asíncrono de correos: ${err.message}`);
    });

    return {
      exito: true,
      mensaje: 'Evento registrado con éxito.',
      id_evento: nuevoEvento.id_evento
    };
  }

  private async ejecutarFlujoCorreosDinamico(id_evento: number) {
    // A. Obtener los datos completitos del evento junto con los del Coordinador (Usuario)
    const sqlInfoCompleta = `
      SELECT e.*, u.correo_usuario as correo_coordinador, (u.nombre_usuario || ' ' || u.apellidop_usuario) as nombre_coordinador
      FROM Eventos e
      JOIN Usuarios u ON e.id_usuario = u.id_usuario
      WHERE e.id_evento = $1
    `;
    const resInfo = await this.db.query(sqlInfoCompleta, [id_evento]);
    const infoEventoCompleto = resInfo.rows[0];

    // B. Obtener los correos y nombres de las Áreas de Apoyo asociadas a este evento
    const sqlAreasAsociadas = `
      SELECT a.nombre_area, a.correocontacto_area 
      FROM Evento_Area ea
      JOIN Areas a ON ea.id_area = a.id_area
      WHERE ea.id_evento = $1
    `;
    const resAreas = await this.db.query(sqlAreasAsociadas, [id_evento]);
    const areasAsignadas = resAreas.rows; // Trae un arreglo [{nombre_area: 'Audiovisuales', correocontacto_area: '...'}, ...]

    // Mapeamos los datos para las plantillas
    const nombresAreas = areasAsignadas.map(a => a.nombre_area);
    const textoAreas = nombresAreas.length > 0 ? nombresAreas.join(', ') : 'Ninguna adicional';

    // C. Lanzar los envíos utilizando la información traída de Postgres
    // 1. Al Administrador (Fijo del .env)
    await this.mailService.enviarNotificacionAdmin(infoEventoCompleto, textoAreas);

    // 2. Al Coordinador (Dinámico de la base de datos)
    await this.mailService.enviarConfirmacionCoordinador(infoEventoCompleto);

    // 3. A Gelasio (Fijo del .env)
    await this.mailService.enviarNotificacionGelasio(infoEventoCompleto, textoAreas);

    // 4. A cada una de las Áreas de Apoyo (Dinámico de la base de datos)
    for (const area of areasAsignadas) {
      if (area.correocontacto_area) {
        await this.mailService.enviarNotificacionArea(area.correocontacto_area, infoEventoCompleto);
      }
    }
  }

  /**
   * ⏰ TAREA AUTOMATIZADA: Cron Job por Hora
   * Escanea la base de datos buscando eventos en estatus 'Pendiente' (id_estatus_evento = 1)
   * que estén a exactamente 5 días, 2 días o 4 horas de comenzar.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async verificarYEnviarRecordatorios() {
    this.logger.log('⏰ Ejecutando escaneo automático de recordatorios...');

    try {
      const queryBase = `
        SELECT e.*, 
               u.correo_usuario as correo_coordinador, 
               (u.nombre_usuario || ' ' || u.apellidop_usuario) as nombre_coordinador,
               esp.nombre_espacio
        FROM Eventos e
        JOIN Usuarios u ON e.id_usuario = u.id_usuario
        LEFT JOIN Espacios esp ON e.id_espacio = esp.id_espacio
        WHERE e.id_estatus_evento = 1
      `;

      const res = await this.db.query(queryBase, []);
      const eventosPendientes = res.rows;
      const ahora = new Date();

      for (const evento of eventosPendientes) {
        // Reconstruimos la fecha y hora de inicio exacta del evento
        const fechaEventoOriginal = new Date(evento.fecha_evento);
        const [horas, minutos, segundos] = evento.horainicio_evento.split(':');
        
        const fechaHoraInicio = new Date(
          fechaEventoOriginal.getFullYear(),
          fechaEventoOriginal.getMonth(),
          fechaEventoOriginal.getDate(),
          parseInt(horas),
          parseInt(minutos),
          parseInt(segundos)
        );

        // Calculamos la diferencia de tiempo restante en horas
        const diferenciaMilisegundos = fechaHoraInicio.getTime() - ahora.getTime();
        const diferenciaHoras = diferenciaMilisegundos / (1000 * 60 * 60);

        // 1. Margen de 5 días antes (Entre 120 y 121 horas de diferencia)
        if (diferenciaHoras >= 120 && diferenciaHoras < 121) {
          await this.mailService.enviarRecordatorioCoordinador(evento, '5 días');
          this.logger.log(`📧 Recordatorio de 5 días enviado para el evento ID: ${evento.id_evento}`);
        }
        
        // 2. Margen de 2 días antes (Entre 48 y 49 horas de diferencia)
        else if (diferenciaHoras >= 48 && diferenciaHoras < 49) {
          await this.mailService.enviarRecordatorioCoordinador(evento, '2 días');
          this.logger.log(`📧 Recordatorio de 2 días enviado para el evento ID: ${evento.id_evento}`);
        }
        
        // 3. Margen de 4 horas antes (Entre 4 y 5 horas de diferencia)
        else if (diferenciaHoras >= 4 && diferenciaHoras < 5) {
          await this.mailService.enviarRecordatorioCoordinador(evento, '4 horas');
          this.logger.log(`📧 Recordatorio de 4 horas enviado para el evento ID: ${evento.id_evento}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`❌ Error en el Cron Job de recordatorios: ${error.message}`);
    }
  }
}