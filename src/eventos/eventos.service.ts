import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
import { Cron, CronExpression } from '@nestjs/schedule'; 
import { google } from 'googleapis'; 

@Injectable()
export class EventosService {
    private readonly logger = new Logger(EventosService.name);

    private oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
    );

    constructor(
        private readonly db: DatabaseService,
        private readonly mailService: MailService,
    ) { }

    generarUrlAutenticacionGoogle(id_usuario: number): string {
        const scopes = ['https://www.googleapis.com/auth/calendar'];

        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline', 
            scope: scopes,
            prompt: 'consent', 
            state: id_usuario.toString(), 
        });
    }

    async intercambiarCodigoPorTokens(code: string): Promise<any> {
        const { tokens } = await this.oauth2Client.getToken(code);
        return tokens; 
    }

    async guardarTokensDeUsuario(id_usuario: number, tokens: any) {
        this.logger.log(` Guardando tokens de google para el usuario ID: ${id_usuario}`);

        const sql = `
            UPDATE Usuarios 
            SET google_refresh_token = $1, google_access_token = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id_usuario = $3
        `;

        await this.db.query(sql, [
            tokens.refresh_token || null, 
            tokens.access_token,
            id_usuario
        ]);

        this.logger.log(` Tokens de Google Calendar vinculados con éxito.`);
    }

    async crearEventoEnGoogleCalendar(tokensUsuario: any, evento: any) {
        try {
            this.oauth2Client.setCredentials(tokensUsuario);
            const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

            const fechaInicioISO = `${evento.fecha_evento}T${evento.horainicio_evento}-06:00`;
            const fechaFinISO = `${evento.fecha_evento}T${evento.horafin_evento}-06:00`;

            const googleEvent = {
                summary: evento.nombre_evento,
                location: evento.nombre_espacio || 'Campus Universitario',
                description: evento.descripcion_evento,
                start: {
                    dateTime: fechaInicioISO,
                    timeZone: 'America/Mexico_City',
                },
                end: {
                    dateTime: fechaFinISO,
                    timeZone: 'America/Mexico_City',
                },
                attendees: [
                    { email: evento.correo_coordinador }
                ],
            };

            const response = await calendar.events.insert({
                calendarId: 'primary',
                requestBody: googleEvent,
            });

            this.logger.log(` Evento sincronizado en Google Calendar. URL: ${response.data.htmlLink}`);
            return response.data;
        } catch (error: any) {
            this.logger.error(` Error al insertar en Google Calendar: ${error.message}`);
            throw error;
        }
    }

    async agendarYNotificar(datosFormulario: any) {
        const {
            nombre: nombre_evento,
            comentarios: descripcion_evento,
            objetivo: objetivo_evento,
            publicoobjetivo_eventos = 'Comunidad Universitaria', 
            fecha: fecha_evento,
            hora: horainicio_evento,
            horaFin: horafin_evento,
            horaApartado: horapreparacion_evento,
            prioridad: priority_texto, 
            id_usuario,
            plantel: id_plantel, 
            area: id_espacio,    
            id_area_solicitante = 1, 
            ids_areas_apoyo = []    
        } = datosFormulario;

        let id_prioridad = 2; 
        if (priority_texto === 'Alta') id_prioridad = 1;
        if (priority_texto === 'Baja') id_prioridad = 3;

        let id_estatus_evento = 1; 

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

        // --- 1ER CAMBIO: Se cambió 'Evento_Area' por 'Evento_Departamento' y 'estatus_eventoa' por 'estado_apoyo' ---
        if (ids_areas_apoyo && ids_areas_apoyo.length > 0) {
            for (const id_area of ids_areas_apoyo) {
                await this.db.query(
                    `INSERT INTO Evento_Departamento (id_evento, id_area, estado_apoyo) VALUES ($1, $2, 'Pendiente')`,
                    [nuevoEvento.id_evento, id_area]
                );
            }
        }

        this.logger.log(` Evento e intermedias guardados con éxito en Neon. ID: ${nuevoEvento.id_evento}`);

        this.ejecutarFlujoCorreosDinamico(nuevoEvento.id_evento).catch((err: any) => {
            this.logger.error(` Error en el proceso asíncrono de correos: ${err.message}`);
        });

        return {
            exito: true,
            mensaje: 'Evento registrado con éxito.',
            id_evento: nuevoEvento.id_evento
        };
    }

    private async ejecutarFlujoCorreosDinamico(id_evento: number) {
        const sqlInfoCompleta = `
        SELECT e.*, u.correo_usuario as correo_coordinador, (u.nombre_usuario || ' ' || u.apellidop_usuario) as nombre_coordinador
        FROM Eventos e
        JOIN Usuarios u ON e.id_usuario = u.id_usuario
        WHERE e.id_evento = $1
        `;
        const resInfo = await this.db.query(sqlInfoCompleta, [id_evento]);
        const infoEventoCompleto = resInfo.rows[0];

        // --- 2DO CAMBIO: Ajustado para consultar 'Evento_Departamento' en vez de 'Evento_Area' ---
        const sqlAreasAsociadas = `
        SELECT a.nombre_area, a.correocontacto_area 
        FROM Evento_Departamento ed
        JOIN Areas a ON ed.id_area = a.id_area
        WHERE ed.id_evento = $1
        `;
        const resAreas = await this.db.query(sqlAreasAsociadas, [id_evento]);
        const areasAsignadas = resAreas.rows;

        const nombresAreas = areasAsignadas.map(a => a.nombre_area);
        const textoAreas = nombresAreas.length > 0 ? nombresAreas.join(', ') : 'Ninguna adicional';

        await this.mailService.enviarNotificacionAdmin(infoEventoCompleto, textoAreas);
        await this.mailService.enviarConfirmacionCoordinador(infoEventoCompleto);
        await this.mailService.enviarNotificacionGelasio(infoEventoCompleto, textoAreas);

        for (const area of areasAsignadas) {
            if (area.correocontacto_area) {
                await this.mailService.enviarNotificacionArea(area.correocontacto_area, infoEventoCompleto);
            }
        }

        try {
            const resUser = await this.db.query(`SELECT google_refresh_token, google_access_token FROM Usuarios WHERE id_usuario = $1`, [infoEventoCompleto.id_usuario]);
            const usuarioTokens = resUser.rows[0];

            if (usuarioTokens && usuarioTokens.google_refresh_token) {
                const tokensObj = { 
                    refresh_token: usuarioTokens.google_refresh_token,
                    access_token: usuarioTokens.google_access_token 
                };
                
                const resEspacio = await this.db.query(`SELECT nombre_espacio FROM Espacios WHERE id_espacio = $1`, [infoEventoCompleto.id_espacio]);
                infoEventoCompleto.nombre_espacio = resEspacio.rows[0]?.nombre_espacio || 'Sin espacio asignado';

                const googleRes = await this.crearEventoEnGoogleCalendar(tokensObj, infoEventoCompleto);

                // --- 3ER CAMBIO: Eliminamos la columna redundante 'sincronizado' ya que por defecto es FALSE en tu script de BD ---
                await this.db.query(`
                    INSERT INTO Evento_Calendar (id_evento, google_calendar_id, fecha_sincronizacion, oauth_email)
                    VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
                `, [id_evento, googleRes.id, infoEventoCompleto.correo_coordinador]);
            }
        } catch (gErr: any) {
            this.logger.error(` No se pudo sincronizar automáticamente en Google Calendar: ${gErr.message}`);
        }
    }

    @Cron(CronExpression.EVERY_HOUR)
    async verificarYEnviarRecordatorios() {
        this.logger.log(' Ejecutando escaneo automático de recordatorios...');

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
                const fechaString = evento.fecha_evento instanceof Date 
                  ? evento.fecha_evento.toISOString().split('T')[0] 
                  : evento.fecha_evento; 

                const [ano, mes, dia] = fechaString.split('-');
                const [horas, minutos, segundos] = evento.horainicio_evento.split(':');
                 
                const fechaHoraInicio = new Date(
                  parseInt(ano),
                  parseInt(mes) - 1, 
                  parseInt(dia),
                  parseInt(horas),
                  parseInt(minutos),
                  parseInt(segundos)
                );

                const diferenciaMilisegundos = fechaHoraInicio.getTime() - ahora.getTime();
                const diferenciaHoras = diferenciaMilisegundos / (1000 * 60 * 60);

                if (diferenciaHoras >= 120 && diferenciaHoras < 121) {
                    await this.mailService.enviarRecordatorioCoordinador(evento, '5 días');
                    this.logger.log(` Recordatorio de 5 días enviado para el evento ID: ${evento.id_evento}`);
                }
                else if (diferenciaHoras >= 48 && diferenciaHoras < 49) {
                    await this.mailService.enviarRecordatorioCoordinador(evento, '2 días');
                    this.logger.log(` Recordatorio de 2 días enviado para el evento ID: ${evento.id_evento}`);
                }
                else if (diferenciaHoras >= 4 && diferenciaHoras < 5) {
                    await this.mailService.enviarRecordatorioCoordinador(evento, '4 horas');
                    this.logger.log(` Recordatorio de 4 horas enviado para el evento ID: ${evento.id_evento}`);
                }
            }
        } catch (error: any) {
            this.logger.error(` Error en el Cron Job de recordatorios: ${error.message}`);
        }
    }

    private async creeringEventoEnGoogleCalendar(tokensUsuario: any, evento: any) {
         return await this.crearEventoEnGoogleCalendar(tokensUsuario, evento);
    }
}