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

            let fechaStr = evento.fecha_evento;
            if (fechaStr instanceof Date) {
                const yyyy = fechaStr.getFullYear();
                const mm = String(fechaStr.getMonth() + 1).padStart(2, '0');
                const dd = String(fechaStr.getDate()).padStart(2, '0');
                fechaStr = `${yyyy}-${mm}-${dd}`;
            } else if (typeof fechaStr === 'string' && fechaStr.includes('T')) {
                fechaStr = fechaStr.split('T')[0];
            }
            
            const horaInicioStr = (evento.horainicio_evento || '00:00').length === 5 ? `${evento.horainicio_evento}:00` : evento.horainicio_evento;
            const horaFinStr = (evento.horafin_evento || '00:00').length === 5 ? `${evento.horafin_evento}:00` : evento.horafin_evento;

            const fechaInicioISO = `${fechaStr}T${horaInicioStr}-06:00`;
            const fechaFinISO = `${fechaStr}T${horaFinStr}-06:00`;

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
        // Muestra en tu consola todo lo que envía React para validar mapeos
        console.log(" DENTRO DE NESTJS - DATOS RECIBIDOS DEL FORMULARIO:", datosFormulario);

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
            plantel: plantelNombre, 
            area: espacioNombre,    
            id_area_solicitante = 1, 
            ids_areas_apoyo = []    
        } = datosFormulario;

        let id_prioridad = 2; 
        if (priority_texto === 'Alta') id_prioridad = 1;
        if (priority_texto === 'Baja') id_prioridad = 3;

        let id_estatus_evento = 1; 
        
        try {
            // Buscar o crear el Plantel para obtener su ID numérico
            let id_plantel = null;
            if (plantelNombre) {
                const resPlantel = await this.db.query('SELECT id_plantel FROM Planteles WHERE nombre_plantel = $1', [plantelNombre]);
                if (resPlantel.rows.length > 0) {
                    id_plantel = resPlantel.rows[0].id_plantel;
                } else {
                    const insertPlantel = await this.db.query('INSERT INTO Planteles (nombre_plantel) VALUES ($1) RETURNING id_plantel', [plantelNombre]);
                    id_plantel = insertPlantel.rows[0].id_plantel;
                }
            }

            // Buscar o crear el Espacio (Área) para obtener su ID numérico
            let id_espacio = null;
            if (espacioNombre) {
                const resEspacio = await this.db.query('SELECT id_espacio FROM Espacios WHERE nombre_espacio = $1', [espacioNombre]);
                if (resEspacio.rows.length > 0) {
                    id_espacio = resEspacio.rows[0].id_espacio;
                } else {
                    const insertEspacio = await this.db.query('INSERT INTO Espacios (nombre_espacio, id_plantel) VALUES ($1, $2) RETURNING id_espacio', [espacioNombre, id_plantel]);
                    id_espacio = insertEspacio.rows[0].id_espacio;
                }
            }

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

        } catch (dbError: any) {
            // Captura el error exacto que arroje Neon (PostgreSQL)
            this.logger.error(` CRÍTICO - Error directo de PostgreSQL al insertar evento: ${dbError.message}`);
            throw new Error(`Error en BD: ${dbError.message}`);
        }
    }

    private async ejecutarFlujoCorreosDinamico(id_evento: number) {
        const sqlInfoCompleta = `
        SELECT e.*, u.correo_usuario as correo_coordinador, (u.nombre_usuario || ' ' || u.apellidop_usuario) as nombre_coordinador, es.nombre_espacio
        FROM Eventos e
        JOIN Usuarios u ON e.id_usuario = u.id_usuario
        LEFT JOIN Espacios es ON e.id_espacio = es.id_espacio
        WHERE e.id_evento = $1
        `;
        const resInfo = await this.db.query(sqlInfoCompleta, [id_evento]);
        const infoEventoCompleto = resInfo.rows[0];

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
        await this.mailService.enviarInvitacionImanol(infoEventoCompleto);

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

                await this.db.query(`
                    INSERT INTO Evento_Calendar (id_evento, google_calendar_id, fecha_sincronizacion, oauth_email)
                    VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
                `, [id_evento, googleRes.id, infoEventoCompleto.correo_coordinador]);
            }
        } catch (gErr: any) {
            this.logger.error(` No se pudo sincronizar automáticamente en Google Calendar: ${gErr.message}`);
        }
    }

    async obtenerTodos() {
        const sql = `
            SELECT 
                e.id_evento,
                e.nombre_evento,
                e.descripcion_evento,
                e.objetivo_evento,
                e.fecha_evento,
                e.horainicio_evento,
                e.horafin_evento,
                e.horapreparacion_evento,
                e.id_prioridad as prioridad_evento,
                e.id_estatus_evento as estatus_evento,
                p.nombre_plantel,
                es.nombre_espacio,
                u.nombre_usuario || ' ' || u.apellidop_usuario as responsable_evento,
                (
                    SELECT json_agg(json_build_object('nombre_proveedor', pr.nombre_proveedor))
                    FROM Evento_Departamento ed
                    JOIN Areas ar ON ed.id_area = ar.id_area
                    LEFT JOIN Proveedores pr ON pr.nombre_proveedor = ar.nombre_area 
                    WHERE ed.id_evento = e.id_evento
                ) as proveedor_evento
            FROM Eventos e
            LEFT JOIN Planteles p ON e.id_plantel = p.id_plantel
            LEFT JOIN Espacios es ON e.id_espacio = es.id_espacio
            LEFT JOIN Usuarios u ON e.id_usuario = u.id_usuario
            ORDER BY e.fecha_evento ASC, e.horainicio_evento ASC
        `;
        const result = await this.db.query(sql);
        
        // Transform the result to match the frontend expectations
        return result.rows.map(row => ({
            ...row,
            planteles: { nombre_plantel: row.nombre_plantel },
            espacios: { nombre_espacio: row.nombre_espacio },
            estatus_evento: row.estatus_evento === 1 ? 'Pendiente' : (row.estatus_evento === 2 ? 'Confirmado' : 'Cancelado'),
            proveedor_evento: row.proveedor_evento ? row.proveedor_evento.map((p: any) => ({ proveedores: { nombre_proveedor: p.nombre_proveedor } })) : [],
            requiere_cobertura: row.proveedor_evento && row.proveedor_evento.length > 0
        }));
    }
}