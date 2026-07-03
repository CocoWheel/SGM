import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
import { Cron, CronExpression } from '@nestjs/schedule'; // Importación necesaria para el programador
import { google } from 'googleapis'; //  Importación oficial del SDK de Google

@Injectable()
export class EventosService {
    private readonly logger = new Logger(EventosService.name);

    // Inicializamos el cliente OAuth2 usando las variables de tu archivo .env
    private oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
    );

    constructor(
        private readonly db: DatabaseService,
        private readonly mailService: MailService,
    ) { }

    /**
     * Genera la URL para que el usuario inicie sesión en Google y otorgue permisos
     *  Modificado: Ahora acepta id_usuario e inyecta el 'state' para el callback
     */
    generarUrlAutenticacionGoogle(id_usuario: number): string {
        const scopes = ['https://www.googleapis.com/auth/calendar'];

        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline', // OBLIGATORIO para obtener el refresh_token
            scope: scopes,
            prompt: 'consent', // Fuerza a mostrar la pantalla de permisos siempre
            state: id_usuario.toString(), //  Vinculamos el ID de usuario aquí
        });
    }

    /**
     * Intercambia el código temporal por los tokens definitivos.
     */
    async intercambiarCodigoPorTokens(code: string): Promise<any> {
        const { tokens } = await this.oauth2Client.getToken(code);
        return tokens; // Retorna un objeto con access_token, refresh_token, etc.
    }

    /**
     *  Guarda los tokens obtenidos directamente en las columnas individuales de la BD de Neon.
     */
    async guardarTokensDeUsuario(id_usuario: number, tokens: any) {
        this.logger.log(` Guardando tokens de google para el usuario ID: ${id_usuario}`);

        const sql = `
            UPDATE Usuarios 
            SET google_refresh_token = $1, google_access_token = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id_usuario = $3
        `;

        await this.db.query(sql, [
            tokens.refresh_token || null, // Nota: Google solo envía el refresh_token en el primer consentimiento
            tokens.access_token,
            id_usuario
        ]);

        this.logger.log(` Tokens de Google Calendar vinculados con éxito.`);
    }

    /**
     * Inserta físicamente un evento en el Google Calendar del usuario usando sus credenciales
     */
    async crearEventoEnGoogleCalendar(tokensUsuario: any, evento: any) {
        try {
            this.oauth2Client.setCredentials(tokensUsuario);
            const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

            // Estructuramos fechas en formato ISO (Ejemplo ajustado a Zona Horaria de México -06:00)
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

    /**
     * Registra un evento en la BD y dispara flujos asíncronos
     */
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

        this.logger.log(` Evento e intermedias guardados con éxito en Neon. ID: ${nuevoEvento.id_evento}`);

        // 3. Disparar el flujo de correos y sincronización de Google Calendar en segundo plano
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
        const areasAsignadas = resAreas.rows;

        // Mapeamos los datos para las plantillas
        const nombresAreas = areasAsignadas.map(a => a.nombre_area);
        const textoAreas = nombresAreas.length > 0 ? nombresAreas.join(', ') : 'Ninguna adicional';

        // C. Lanzar los envíos utilizando la información traída de Postgres
        await this.mailService.enviarNotificacionAdmin(infoEventoCompleto, textoAreas);
        await this.mailService.enviarConfirmacionCoordinador(infoEventoCompleto);
        await this.mailService.enviarNotificacionGelasio(infoEventoCompleto, textoAreas);

        for (const area of areasAsignadas) {
            if (area.correocontacto_area) {
                await this.mailService.enviarNotificacionArea(area.correocontacto_area, infoEventoCompleto);
            }
        }

        //  SINCRONIZACIÓN AUTOMÁTICA EN GOOGLE CALENDAR TRAS AGENDAR
        try {
            const resUser = await this.db.query(`SELECT google_refresh_token, google_access_token FROM Usuarios WHERE id_usuario = $1`, [infoEventoCompleto.id_usuario]);
            const usuarioTokens = resUser.rows[0];

            if (usuarioTokens && usuarioTokens.google_refresh_token) {
                const tokensObj = { 
                    refresh_token: usuarioTokens.google_refresh_token,
                    access_token: usuarioTokens.google_access_token 
                };
                
                // Obtenemos el nombre del espacio para la ubicación en Google
                const resEspacio = await this.db.query(`SELECT nombre_espacio FROM Espacios WHERE id_espacio = $1`, [infoEventoCompleto.id_espacio]);
                infoEventoCompleto.nombre_espacio = resEspacio.rows[0]?.nombre_espacio || 'Sin espacio asignado';

                const googleRes = await this.crearEventoEnGoogleCalendar(tokensObj, infoEventoCompleto);

                // Guardamos la constancia en tu tabla 'Evento_Calendar'
                await this.db.query(`
                    INSERT INTO Evento_Calendar (id_evento, google_calendar_id, sincronizado, fecha_sincronizacion, oauth_email)
                    VALUES ($1, $2, true, CURRENT_TIMESTAMP, $3)
                `, [id_evento, googleRes.id, infoEventoCompleto.correo_coordinador]);
            }
        } catch (gErr: any) {
            this.logger.error(` No se pudo sincronizar automáticamente en Google Calendar: ${gErr.message}`);
        }
    }

    /**
     *  TAREA AUTOMATIZADA: Cron Job por Hora sin desfases de zonas horarias
     */
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
                // Corrección antipatrón Zona Horaria: Extraemos la fecha pura como string YYYY-MM-DD
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

                // 1. Margen de 5 días antes (Entre 120 y 121 horas de diferencia)
                if (diferenciaHoras >= 120 && diferenciaHoras < 121) {
                    await this.mailService.enviarRecordatorioCoordinador(evento, '5 días');
                    this.logger.log(` Recordatorio de 5 días enviado para el evento ID: ${evento.id_evento}`);
                }
                // 2. Margen de 2 días antes (Entre 48 y 49 horas de diferencia)
                else if (diferenciaHoras >= 48 && diferenciaHoras < 49) {
                    await this.mailService.enviarRecordatorioCoordinador(evento, '2 días');
                    this.logger.log(` Recordatorio de 2 días enviado para el evento ID: ${evento.id_evento}`);
                }
                // 3. Margen de 4 horas antes (Entre 4 y 5 horas de diferencia)
                else if (diferenciaHoras >= 4 && diferenciaHoras < 5) {
                    await this.mailService.enviarRecordatorioCoordinador(evento, '4 horas');
                    this.logger.log(` Recordatorio de 4 horas enviado para el evento ID: ${evento.id_evento}`);
                }
            }
        } catch (error: any) {
            this.logger.error(` Error en el Cron Job de recordatorios: ${error.message}`);
        }
    }

    // Helper por si hay llamadas con nombres ligeramente modificados en flujos previos
    private async creeringEventoEnGoogleCalendar(tokensUsuario: any, evento: any) {
         return await this.crearEventoEnGoogleCalendar(tokensUsuario, evento);
    }
}