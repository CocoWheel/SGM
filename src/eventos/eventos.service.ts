import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
import { google } from 'googleapis';
import { CrearEventoDto } from './dto/crear-evento.dto';

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
  ) {}

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
    this.logger.log(
      ` Guardando tokens de google para el usuario ID: ${id_usuario}`,
    );
    await this.db.usuarios.update({
      where: { id_usuario },
      data: {
        google_refresh_token: tokens.refresh_token || null,
        google_access_token: tokens.access_token,
        updated_at: new Date(),
      },
    });
    this.logger.log(` Tokens de Google Calendar vinculados con éxito.`);
  }

  async crearEventoEnGoogleCalendar(tokensUsuario: any, evento: any) {
    try {
      this.oauth2Client.setCredentials(tokensUsuario);
      const calendar = google.calendar({
        version: 'v3',
        auth: this.oauth2Client,
      });

      let fechaStr = evento.fecha_evento;
      if (fechaStr instanceof Date) {
        const yyyy = fechaStr.getFullYear();
        const mm = String(fechaStr.getMonth() + 1).padStart(2, '0');
        const dd = String(fechaStr.getDate()).padStart(2, '0');
        fechaStr = `${yyyy}-${mm}-${dd}`;
      } else if (typeof fechaStr === 'string' && fechaStr.includes('T')) {
        fechaStr = fechaStr.split('T')[0];
      }

      // Format time correctly
      const formatearHora = (fecha: Date | string) => {
        if (fecha instanceof Date) {
          return `${String(fecha.getUTCHours()).padStart(2, '0')}:${String(fecha.getUTCMinutes()).padStart(2, '0')}:00`;
        }
        return (fecha || '00:00').length === 5 ? `${fecha}:00` : fecha;
      };

      const horaInicioStr = formatearHora(evento.horainicio_evento);
      const horaFinStr = formatearHora(evento.horafin_evento);

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
        attendees: [{ email: evento.correo_coordinador }],
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: googleEvent,
      });

      this.logger.log(
        ` Evento sincronizado en Google Calendar. URL: ${response.data.htmlLink}`,
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        ` Error al insertar en Google Calendar: ${error.message}`,
      );
      throw error;
    }
  }

  async agendarYNotificar(datosFormulario: CrearEventoDto) {
    console.log(
      ' DENTRO DE NESTJS - DATOS RECIBIDOS DEL FORMULARIO:',
      datosFormulario,
    );

    const {
      nombre,
      comentarios,
      objetivo,
      publicoobjetivo_eventos = 'Comunidad Universitaria',
      fecha,
      hora,
      horaFin,
      horaApartado,
      prioridad,
      id_usuario,
      plantel,
      area,
      id_area_solicitante = 1,
      proveedoresIds = [],
      invitados = [],
      fotografiaResena,
      apoyoAcceso,
      apoyoMantenimiento,
      Mantenimiento,
      apoyoAudiovisual,
      equiposAudiovisuales,
    } = datosFormulario;

    // (Las IDs de prioridad y estatus se resolverán dinámicamente abajo)

    // Convertir strings a Date para Prisma
    const fechaObj = new Date(`${fecha}T00:00:00.000Z`);
    const horaInicioObj = new Date(`1970-01-01T${hora}:00.000Z`);
    const horaFinObj = new Date(`1970-01-01T${horaFin}:00.000Z`);
    const horaApartadoObj = horaApartado
      ? new Date(`1970-01-01T${horaApartado}:00.000Z`)
      : null;

    try {
      // Buscar o crear el Plantel
      let id_plantel = 1;
      if (plantel) {
        const resPlantel = await this.db.planteles.findFirst({
          where: { nombre_plantel: plantel },
        });
        if (resPlantel) {
          id_plantel = resPlantel.id_plantel;
        } else {
          const insertPlantel = await this.db.planteles.create({
            data: { nombre_plantel: plantel },
          });
          id_plantel = insertPlantel.id_plantel;
        }
      }

      // Buscar o crear el Espacio
      let id_espacio = 1;
      if (area) {
        const resEspacio = await this.db.espacios.findFirst({
          where: { nombre_espacio: area },
        });
        if (resEspacio) {
          id_espacio = resEspacio.id_espacio;
        } else {
          const insertEspacio = await this.db.espacios.create({
            data: { nombre_espacio: area, id_plantel: id_plantel },
          });
          id_espacio = insertEspacio.id_espacio;
        }
      }

      // SAFETY: Asegurar que existan los catálogos requeridos (Prioridad, Estatus, Area) sin forzar el ID
      let id_prioridad = 2;
      const prioridadTexto = prioridad || 'Media';
      const resPrioridad = await this.db.prioridades_evento.findFirst({
        where: { nombre_prioridad: prioridadTexto },
      });
      if (resPrioridad) {
        id_prioridad = resPrioridad.id_prioridad;
      } else {
        const insertPrioridad = await this.db.prioridades_evento.create({
          data: { nombre_prioridad: prioridadTexto },
        });
        id_prioridad = insertPrioridad.id_prioridad;
      }

      let id_estatus_evento = 1;
      const resEstatus = await this.db.estatus_evento.findFirst({
        where: { nombre_estatus: 'Pendiente' },
      });
      if (resEstatus) {
        id_estatus_evento = resEstatus.id_estatus_evento;
      } else {
        const insertEstatus = await this.db.estatus_evento.create({
          data: { nombre_estatus: 'Pendiente' },
        });
        id_estatus_evento = insertEstatus.id_estatus_evento;
      }

      let final_id_area_solicitante = id_area_solicitante;
      // Verificar si el id_area_solicitante que vino del frontend realmente existe
      const checkArea = await this.db.areas.findUnique({
        where: { id_area: final_id_area_solicitante },
      });
      if (!checkArea) {
        // Si no existe (ej. era 1 y no había nada), creamos una genérica
        const resArea = await this.db.areas.findFirst({
          where: { nombre_area: 'Área Solicitante Predeterminada' },
        });
        if (resArea) {
          final_id_area_solicitante = resArea.id_area;
        } else {
          const insertArea = await this.db.areas.create({
            data: { nombre_area: 'Área Solicitante Predeterminada' },
          });
          final_id_area_solicitante = insertArea.id_area;
        }
      }

      // Preparar proveedores (si existen)
      const proveedoresCreate = proveedoresIds.map((id_proveedor) => ({
        id_proveedor,
      }));

      // Procesar equipos audiovisuales
      const mapeoEquipos: Record<string, string> = {
        equ1: 'Sonido',
        equ2: 'Audio para presentación',
        equ3: 'Micrófono',
        equ4: 'Pantalla',
      };
      const equiposAudiovisualesArr = equiposAudiovisuales
        ? Object.keys(equiposAudiovisuales)
            .filter((key) => equiposAudiovisuales[key])
            .map((key) => mapeoEquipos[key] || key)
        : [];

      // Procesar invitados
      const invitadosCreate = invitados
        ? invitados.map((inv) => ({
            invitados: {
              create: {
                nombre_invitado: inv.nombre || '',
                apellidop_invitado: inv.apellidoPaterno || '',
                apellidom_invitado: inv.apellidoMaterno || '',
                correo_invitado: inv.correo || '',
                telefono_invitado: inv.telefono || '',
                institucion_invitado: inv.institucion || '',
                tipo_invitado: inv.nivelAutoridad || '',
              },
            },
          }))
        : [];

      // Insertar Evento completo con Prisma
      const nuevoEvento = await this.db.eventos.create({
        data: {
          nombre_evento: nombre,
          descripcion_evento: comentarios || '',
          objetivo_evento: objetivo,
          publicoobjetivo_eventos: publicoobjetivo_eventos,
          fecha_evento: fechaObj,
          horainicio_evento: horaInicioObj,
          horafin_evento: horaFinObj,
          horapreparacion_evento: horaApartadoObj,
          id_prioridad,
          id_estatus_evento,
          id_usuario,
          id_plantel,
          id_espacio,
          id_area_solicitante: final_id_area_solicitante,
          fotografia_resena: fotografiaResena === 'si',
          apoyo_acceso: apoyoAcceso === 'si',
          apoyo_mantenimiento: apoyoMantenimiento === 'si',
          detalles_mantenimiento: Mantenimiento || null,
          apoyo_audiovisual: apoyoAudiovisual === 'si',
          equipos_audiovisuales: equiposAudiovisualesArr,
          proveedor_evento: {
            create: proveedoresCreate,
          },
          asistencia_evento: {
            create: invitadosCreate,
          },
        },
      });

      this.logger.log(
        ` Evento e intermedias guardados con éxito en Neon mediante Prisma. ID: ${nuevoEvento.id_evento}`,
      );

      this.ejecutarFlujoCorreosDinamico(nuevoEvento.id_evento).catch(
        (err: any) => {
          this.logger.error(
            ` Error en el proceso asíncrono de correos: ${err.message}`,
          );
        },
      );

      return {
        exito: true,
        mensaje: 'Evento registrado con éxito.',
        id_evento: nuevoEvento.id_evento,
      };
    } catch (dbError: any) {
      this.logger.error(
        ` CRÍTICO - Error de Prisma al insertar evento: ${dbError.message}`,
      );
      throw new HttpException(
        `Error en BD: ${dbError.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async ejecutarFlujoCorreosDinamico(id_evento: number) {
    const rawEvento = await this.db.eventos.findUnique({
      where: { id_evento },
      include: {
        usuarios: true,
        espacios: true,
        proveedor_evento: {
          include: { proveedores: true },
        },
      },
    });

    if (!rawEvento) return;

    const infoEventoCompleto = {
      ...rawEvento,
      correo_coordinador: rawEvento.usuarios.correo_usuario,
      nombre_coordinador: `${rawEvento.usuarios.nombre_usuario} ${rawEvento.usuarios.apellidop_usuario}`,
      nombre_espacio:
        rawEvento.espacios?.nombre_espacio || 'Sin espacio asignado',
    };

    const areasAsignadas = rawEvento.proveedor_evento.map((d) => d.proveedores);
    const nombresAreas = areasAsignadas.map((a) => a.nombre_proveedor);
    const textoAreas =
      nombresAreas.length > 0 ? nombresAreas.join(', ') : 'Ninguna adicional';

    await this.mailService.enviarNotificacionAdmin(
      infoEventoCompleto,
      textoAreas,
    );
    await this.mailService.enviarConfirmacionCoordinador(infoEventoCompleto);
    await this.mailService.enviarNotificacionGelasio(
      infoEventoCompleto,
      textoAreas,
    );
    await this.mailService.enviarInvitacionImanol(infoEventoCompleto);

    for (const area of areasAsignadas) {
      if (area.correo_proveedor) {
        await this.mailService.enviarNotificacionArea(
          area.correo_proveedor,
          infoEventoCompleto,
        );
      }
    }

    try {
      const usuarioTokens = await this.db.usuarios.findUnique({
        where: { id_usuario: infoEventoCompleto.id_usuario },
        select: { google_refresh_token: true, google_access_token: true },
      });

      if (usuarioTokens && usuarioTokens.google_refresh_token) {
        const tokensObj = {
          refresh_token: usuarioTokens.google_refresh_token,
          access_token: usuarioTokens.google_access_token,
        };

        const googleRes = await this.crearEventoEnGoogleCalendar(
          tokensObj,
          infoEventoCompleto,
        );

        await this.db.evento_calendar.create({
          data: {
            id_evento: id_evento,
            google_calendar_id: googleRes.id,
            fecha_sincronizacion: new Date(),
            oauth_email: infoEventoCompleto.correo_coordinador,
          },
        });
      }
    } catch (gErr: any) {
      this.logger.error(
        ` No se pudo sincronizar automáticamente en Google Calendar: ${gErr.message}`,
      );
    }
  }

  async obtenerTodos(id_usuario?: number) {
    let whereCondition = {};

    if (id_usuario) {
      const user = await this.db.usuarios.findUnique({
        where: { id_usuario },
        include: { usuario_rol: { include: { roles: true } } },
      });

      const isRoot = user?.usuario_rol.some(
        (ur) => ur.roles.nombre_rol.toLowerCase() === 'root',
      );

      if (!isRoot) {
        whereCondition = { id_usuario };
      }
    }

    const eventos = await this.db.eventos.findMany({
      where: whereCondition,
      include: {
        planteles: true,
        espacios: true,
        usuarios: true,
        proveedor_evento: {
          include: { proveedores: true },
        },
        asistencia_evento: {
          include: { invitados: true },
        }
      },
      orderBy: [{ fecha_evento: 'asc' }, { horainicio_evento: 'asc' }],
    });

    return eventos.map((e) => {
      // Extraer HH:MM de la fecha Prisma para que el frontend lo lea bien
      const formatearHoraRes = (fecha?: Date | null) => {
        if (!fecha) return null;
        return `${String(fecha.getUTCHours()).padStart(2, '0')}:${String(fecha.getUTCMinutes()).padStart(2, '0')}`;
      };

      return {
        ...e,
        fecha_evento: e.fecha_evento
          ? e.fecha_evento.toISOString().split('T')[0]
          : null,
        horainicio_evento: formatearHoraRes(e.horainicio_evento),
        horafin_evento: formatearHoraRes(e.horafin_evento),
        horapreparacion_evento: formatearHoraRes(e.horapreparacion_evento),
        planteles: { nombre_plantel: e.planteles?.nombre_plantel },
        espacios: { nombre_espacio: e.espacios?.nombre_espacio },
        responsable_evento: `${e.usuarios?.nombre_usuario} ${e.usuarios?.apellidop_usuario}`,
        estatus_evento:
          e.id_estatus_evento === 1
            ? 'Pendiente'
            : e.id_estatus_evento === 2
              ? 'Confirmado'
              : 'Cancelado',
        proveedor_evento: e.proveedor_evento.map((d) => ({
          proveedores: { nombre_proveedor: d.proveedores?.nombre_proveedor },
        })),
        requiere_cobertura: e.proveedor_evento.length > 0 || e.fotografia_resena === true,
      };
    });
  }

  async asignarCobertura(id_evento: number, proveedoresIds: number[], id_usuario: number) {
    try {
      if (!id_usuario) {
        throw new HttpException('Usuario no autorizado.', HttpStatus.UNAUTHORIZED);
      }

      const user = await this.db.usuarios.findUnique({
        where: { id_usuario },
        include: { usuario_rol: { include: { roles: true } } },
      });

      const isAuthorized = user?.usuario_rol.some(
        (ur) => ur.roles.nombre_rol.toLowerCase() === 'root' || ur.roles.nombre_rol.toLowerCase() === 'administrador'
      );

      if (!isAuthorized) {
        throw new HttpException(
          'No tienes permisos para asignar cobertura. Solo Administradores o Root pueden hacerlo.',
          HttpStatus.FORBIDDEN,
        );
      }

      // Create entries in proveedor_evento
      const proveedoresCreate = proveedoresIds.map((id_proveedor) => ({
        id_proveedor,
      }));

      // We might want to remove existing providers first, or simply append.
      // Assuming it's an assignment that overwrites:
      await this.db.proveedor_evento.deleteMany({
        where: { id_evento },
      });

      if (proveedoresIds.length > 0) {
        await this.db.eventos.update({
          where: { id_evento },
          data: {
            proveedor_evento: {
              create: proveedoresCreate,
            }
          }
        });
      }

      return {
        exito: true,
        mensaje: 'Cobertura asignada exitosamente.',
      };
    } catch (error: any) {
      this.logger.error(`Error al asignar cobertura: ${error.message}`);
      throw new HttpException(
        `Error al asignar cobertura: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async actualizarEvento(id_evento: number, datosFormulario: CrearEventoDto) {
    const {
      nombre,
      comentarios,
      objetivo,
      publicoobjetivo_eventos = 'Comunidad Universitaria',
      fecha,
      hora,
      horaFin,
      horaApartado,
      prioridad,
      plantel,
      area,
      invitados = [],
      fotografiaResena,
      apoyoAcceso,
      apoyoMantenimiento,
      Mantenimiento,
      apoyoAudiovisual,
      equiposAudiovisuales,
      estatus
    } = datosFormulario;

    // Convertir strings a Date para Prisma
    const fechaObj = new Date(`${fecha}T00:00:00.000Z`);
    const horaInicioObj = new Date(`1970-01-01T${hora}:00.000Z`);
    const horaFinObj = new Date(`1970-01-01T${horaFin}:00.000Z`);
    const horaApartadoObj = horaApartado
      ? new Date(`1970-01-01T${horaApartado}:00.000Z`)
      : null;

    try {
      // Buscar o crear el Plantel
      let id_plantel = 1;
      if (plantel) {
        const resPlantel = await this.db.planteles.findFirst({
          where: { nombre_plantel: plantel },
        });
        if (resPlantel) {
          id_plantel = resPlantel.id_plantel;
        } else {
          const insertPlantel = await this.db.planteles.create({
            data: { nombre_plantel: plantel },
          });
          id_plantel = insertPlantel.id_plantel;
        }
      }

      // Buscar o crear el Espacio
      let id_espacio = 1;
      if (area) {
        const resEspacio = await this.db.espacios.findFirst({
          where: { nombre_espacio: area },
        });
        if (resEspacio) {
          id_espacio = resEspacio.id_espacio;
        } else {
          const insertEspacio = await this.db.espacios.create({
            data: { nombre_espacio: area, id_plantel: id_plantel },
          });
          id_espacio = insertEspacio.id_espacio;
        }
      }

      let id_prioridad = 2;
      const prioridadTexto = prioridad || 'Media';
      const resPrioridad = await this.db.prioridades_evento.findFirst({
        where: { nombre_prioridad: prioridadTexto },
      });
      if (resPrioridad) {
        id_prioridad = resPrioridad.id_prioridad;
      } else {
        const insertPrioridad = await this.db.prioridades_evento.create({
          data: { nombre_prioridad: prioridadTexto },
        });
        id_prioridad = insertPrioridad.id_prioridad;
      }

      let id_estatus_evento = 1; // Default pendiente
      if (estatus) {
        const est = estatus.toLowerCase();
        if (est === 'confirmado') id_estatus_evento = 2;
        else if (est === 'cancelado') id_estatus_evento = 3;
      }

      // Procesar equipos audiovisuales
      const mapeoEquipos: Record<string, string> = {
        equ1: 'Sonido',
        equ2: 'Audio para presentación',
        equ3: 'Micrófono',
        equ4: 'Pantalla',
      };
      const equiposAudiovisualesArr = equiposAudiovisuales
        ? Object.keys(equiposAudiovisuales)
            .filter((key) => equiposAudiovisuales[key])
            .map((key) => mapeoEquipos[key] || key)
        : [];

      // Delete existing invitados
      await this.db.asistencia_evento.deleteMany({
        where: { id_evento },
      });

      // Procesar invitados
      const invitadosCreate = invitados
        ? invitados.map((inv) => ({
            invitados: {
              create: {
                nombre_invitado: inv.nombre || '',
                apellidop_invitado: inv.apellidoPaterno || '',
                apellidom_invitado: inv.apellidoMaterno || '',
                correo_invitado: inv.correo || '',
                telefono_invitado: inv.telefono || '',
                institucion_invitado: inv.institucion || '',
                tipo_invitado: inv.nivelAutoridad || '',
              },
            },
          }))
        : [];

      // Update Evento
      const eventoActualizado = await this.db.eventos.update({
        where: { id_evento },
        data: {
          nombre_evento: nombre,
          descripcion_evento: comentarios || '',
          objetivo_evento: objetivo,
          publicoobjetivo_eventos: publicoobjetivo_eventos,
          fecha_evento: fechaObj,
          horainicio_evento: horaInicioObj,
          horafin_evento: horaFinObj,
          horapreparacion_evento: horaApartadoObj,
          id_prioridad,
          id_estatus_evento,
          id_plantel,
          id_espacio,
          fotografia_resena: fotografiaResena === 'si',
          apoyo_acceso: apoyoAcceso === 'si',
          apoyo_mantenimiento: apoyoMantenimiento === 'si',
          detalles_mantenimiento: Mantenimiento || null,
          apoyo_audiovisual: apoyoAudiovisual === 'si',
          equipos_audiovisuales: equiposAudiovisualesArr,
          asistencia_evento: {
            create: invitadosCreate,
          },
        },
      });

      return {
        exito: true,
        mensaje: 'Evento actualizado con éxito.',
        id_evento: eventoActualizado.id_evento,
      };
    } catch (dbError: any) {
      this.logger.error(
        ` CRÍTICO - Error de Prisma al actualizar evento: ${dbError.message}`,
      );
      throw new HttpException(
        `Error en BD: ${dbError.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
