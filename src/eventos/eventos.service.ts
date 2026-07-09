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

      // Crear notificaciones para los invitados que ya sean usuarios
      if (invitados && invitados.length > 0) {
        for (const inv of invitados) {
          if (inv.correo) {
            const usuarioExistente = await this.db.usuarios.findUnique({
              where: { correo_usuario: inv.correo }
            });
            if (usuarioExistente) {
              await this.db.notificaciones.create({
                data: {
                  titulo_notificacion: "Invitación a evento",
                  mensaje_notificacion: `Has sido invitado al evento "${nombre}". Por favor confirma tu asistencia.`,
                  id_usuario: usuarioExistente.id_usuario,
                  id_evento: nuevoEvento.id_evento,
                  estatus_notificacion: "Pendiente"
                }
              });
            }
          }
        }
      }

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
        asistencia_evento: {
          include: { invitados: true },
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
    
    const invitadosDelEvento = rawEvento.asistencia_evento?.map((a) => a.invitados) || [];
    await this.mailService.enviarInvitacionesInvitados(infoEventoCompleto, invitadosDelEvento);

    for (const area of areasAsignadas) {
      if (area.correo_proveedor) {
        await this.mailService.enviarNotificacionArea(
          area.correo_proveedor,
          infoEventoCompleto,
        );
      }
    }

    // Enviar correo de invitación a cada invitado
    const listaInvitados = await this.db.asistencia_evento.findMany({
      where: { id_evento },
      include: { invitados: true }
    });
    for (const asistencia of listaInvitados) {
      if (asistencia.invitados && asistencia.invitados.correo_invitado) {
        await this.mailService.enviarInvitacionAInvitado(
          asistencia.invitados.correo_invitado,
          infoEventoCompleto
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
        estatus_evento: true,
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
        estatus_evento: e.estatus_evento?.nombre_estatus || 'Pendiente',
        proveedor_evento: e.proveedor_evento.map((d) => ({
          proveedores: { nombre_proveedor: d.proveedores?.nombre_proveedor },
        })),
        requiere_cobertura: e.proveedor_evento.length > 0 || e.fotografia_resena === true,
      };
    });
  }

  async asignarCobertura(id_evento: number, proveedoresIds: number[], id_usuario: number, prioridad?: string, estatus?: string) {
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

      // Update estatus and prioridad
      let dataToUpdate: any = {};
      
      if (prioridad) {
        let resPrioridad = await this.db.prioridades_evento.findFirst({
          where: { nombre_prioridad: prioridad },
        });
        if (!resPrioridad) {
          resPrioridad = await this.db.prioridades_evento.create({
            data: { nombre_prioridad: prioridad },
          });
        }
        dataToUpdate.id_prioridad = resPrioridad.id_prioridad;
      }
      
      if (estatus) {
        const est = estatus.charAt(0).toUpperCase() + estatus.slice(1).toLowerCase();
        let resEstatus = await this.db.estatus_evento.findFirst({
          where: { nombre_estatus: est },
        });
        if (!resEstatus) {
          resEstatus = await this.db.estatus_evento.create({
            data: { nombre_estatus: est },
          });
        }
        dataToUpdate.id_estatus_evento = resEstatus.id_estatus_evento;
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
        dataToUpdate.proveedor_evento = {
          create: proveedoresCreate,
        };
      }
      
      if (Object.keys(dataToUpdate).length > 0) {
        await this.db.eventos.update({
          where: { id_evento },
          data: dataToUpdate
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
        const est = estatus.charAt(0).toUpperCase() + estatus.slice(1).toLowerCase();
        let resEstatus = await this.db.estatus_evento.findFirst({
          where: { nombre_estatus: est },
        });
        if (!resEstatus) {
          resEstatus = await this.db.estatus_evento.create({
            data: { nombre_estatus: est },
          });
        }
        id_estatus_evento = resEstatus.id_estatus_evento;
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

      // Crear notificaciones para los nuevos invitados que ya sean usuarios
      if (invitados && invitados.length > 0) {
        for (const inv of invitados) {
          if (inv.correo) {
            const usuarioExistente = await this.db.usuarios.findUnique({
              where: { correo_usuario: inv.correo }
            });
            if (usuarioExistente) {
              await this.db.notificaciones.create({
                data: {
                  titulo_notificacion: "Invitación a evento",
                  mensaje_notificacion: `Has sido invitado al evento "${nombre}". Por favor confirma tu asistencia.`,
                  id_usuario: usuarioExistente.id_usuario,
                  id_evento: eventoActualizado.id_evento,
                  estatus_notificacion: "Pendiente"
                }
              });
            }
          }
        }
      }

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

  async registrarAsistencia(id_evento: number, datos: any) {
    try {
      const { nombre, semestre, carrera } = datos;
      // 1. Crear invitado
      const invitado = await this.db.invitados.create({
        data: {
          nombre_invitado: nombre,
          apellidop_invitado: semestre ? `Semestre: ${semestre}` : '',
          apellidom_invitado: carrera ? `Carrera: ${carrera}` : '',
          tipo_invitado: 'Estudiante',
        }
      });
      // 2. Registrar asistencia
      await this.db.asistencia_evento.create({
        data: {
          id_evento,
          id_invitado: invitado.id_invitado,
          asistencia: true,
        }
      });
      return { exito: true, mensaje: 'Asistencia registrada correctamente.' };
    } catch (error: any) {
      this.logger.error(`Error al registrar asistencia: ${error.message}`);
      throw new HttpException('Error al registrar asistencia', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async registrarEncuesta(id_evento: number, datos: any) {
    try {
      const { correo, calificacion, comentarios, recomendacion } = datos;

      // Ensure Encuesta exists
      let encuesta = await this.db.encuestas.findFirst({
        where: { id_evento }
      });
      if (!encuesta) {
        encuesta = await this.db.encuestas.create({
          data: {
            titulo_encuesta: 'Encuesta General',
            id_evento
          }
        });
      }

      // Check if questions exist, if not create them (1 for each: calif, comentarios, recom)
      let preguntas = await this.db.preguntas_encuesta.findMany({
        where: { id_encuesta: encuesta.id_encuesta }
      });
      if (preguntas.length === 0) {
        await this.db.preguntas_encuesta.createMany({
          data: [
            { id_encuesta: encuesta.id_encuesta, id_tipo_pregunta: 1, pregunta: 'Calificacion' },
            { id_encuesta: encuesta.id_encuesta, id_tipo_pregunta: 1, pregunta: 'Comentarios' },
            { id_encuesta: encuesta.id_encuesta, id_tipo_pregunta: 1, pregunta: 'Recomendacion' }
          ]
        });
        preguntas = await this.db.preguntas_encuesta.findMany({
          where: { id_encuesta: encuesta.id_encuesta }
        });
      }

      // Find or create invitado
      let invitado = await this.db.invitados.findFirst({
        where: { correo_invitado: correo }
      });
      if (!invitado) {
        invitado = await this.db.invitados.create({
          data: {
            nombre_invitado: 'Invitado',
            correo_invitado: correo,
          }
        });
      }

      // Record answers
      const respuestas = [
        { pre: 'Calificacion', res: calificacion },
        { pre: 'Comentarios', res: comentarios },
        { pre: 'Recomendacion', res: recomendacion }
      ];

      for (const r of respuestas) {
        let p = preguntas.find(x => x.pregunta === r.pre);
        if (!p) {
          // Si por alguna razón la pregunta no existe en la BD (ej. evento viejo), la creamos
          p = await this.db.preguntas_encuesta.create({
            data: {
              id_encuesta: encuesta.id_encuesta,
              id_tipo_pregunta: r.pre === 'Comentarios' ? 2 : 1,
              pregunta: r.pre
            }
          });
          preguntas.push(p);
        }

        await this.db.respuesta_pregunta.create({
          data: {
            id_pregunta: p.id_pregunta,
            id_invitado: invitado.id_invitado,
            respuesta_texto: String(r.res)
          }
        });
      }

      return { exito: true, mensaje: 'Encuesta registrada correctamente.' };
    } catch (error: any) {
      this.logger.error(`Error al registrar encuesta: ${error.message}`);
      throw new HttpException('Error al registrar encuesta', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async eliminarEvento(id_evento: number) {
    try {
      // 1. Delete from Google Calendar if synced
      const eventoSync = await this.db.evento_calendar.findFirst({
        where: { id_evento }
      });

      if (eventoSync && eventoSync.google_calendar_id) {
        const eventoInfo = await this.db.eventos.findUnique({ where: { id_evento } });
        if (eventoInfo) {
          const usuario = await this.db.usuarios.findUnique({ where: { id_usuario: eventoInfo.id_usuario } });
          if (usuario && usuario.google_refresh_token) {
            try {
              const tokensObj = {
                refresh_token: usuario.google_refresh_token,
                access_token: usuario.google_access_token,
              };
              this.oauth2Client.setCredentials(tokensObj);
              const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
              await calendar.events.delete({
                calendarId: 'primary',
                eventId: eventoSync.google_calendar_id
              });
              this.logger.log(`Evento ${eventoSync.google_calendar_id} eliminado de Google Calendar.`);
            } catch (gErr: any) {
              this.logger.error(`Error al eliminar de Google Calendar: ${gErr.message}`);
            }
          }
        }
      }

      // 2. Remove dependencies before deleting event
      await this.db.$transaction([
        this.db.asistencia_evento.deleteMany({ where: { id_evento } }),
        this.db.evento_calendar.deleteMany({ where: { id_evento } }),
        this.db.evento_cancelacion.deleteMany({ where: { id_evento } }),
        this.db.evento_configuracion.deleteMany({ where: { id_evento } }),
        this.db.evento_departamento.deleteMany({ where: { id_evento } }),
        this.db.evento_historial.deleteMany({ where: { id_evento } }),
        this.db.evento_material.deleteMany({ where: { id_evento } }),
        this.db.notificaciones.deleteMany({ where: { id_evento } }),
        this.db.proveedor_evento.deleteMany({ where: { id_evento } }),
        this.db.reportes_evento.deleteMany({ where: { id_evento } }),
      ]);

      // 3. Clean up encuestas if any
      const encuestas = await this.db.encuestas.findMany({ where: { id_evento } });
      for (const encuesta of encuestas) {
        const preguntas = await this.db.preguntas_encuesta.findMany({ where: { id_encuesta: encuesta.id_encuesta } });
        for (const pregunta of preguntas) {
          await this.db.respuesta_pregunta.deleteMany({ where: { id_pregunta: pregunta.id_pregunta } });
          await this.db.opciones_pregunta.deleteMany({ where: { id_pregunta: pregunta.id_pregunta } });
        }
        await this.db.preguntas_encuesta.deleteMany({ where: { id_encuesta: encuesta.id_encuesta } });
      }
      await this.db.encuestas.deleteMany({ where: { id_evento } });

      // 4. Delete the event itself
      await this.db.eventos.delete({
        where: { id_evento },
      });

      return {
        exito: true,
        mensaje: 'Evento eliminado correctamente.',
      };
    } catch (error: any) {
      this.logger.error(`Error al eliminar evento: ${error.message}`);
      throw new HttpException(
        `Error al eliminar evento: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async cancelarEvento(id_evento: number, motivo: string, id_usuario: number) {
    try {
      // Validar si el evento existe
      const evento = await this.db.eventos.findUnique({
        where: { id_evento },
        include: { asistencia_evento: { include: { invitados: true } } }
      });

      if (!evento) {
        throw new HttpException('Evento no encontrado', HttpStatus.NOT_FOUND);
      }

      // Cambiar estatus a Cancelado (3)
      await this.db.eventos.update({
        where: { id_evento },
        data: { id_estatus_evento: 3 }
      });

      // Insertar motivo en evento_cancelacion
      await this.db.evento_cancelacion.create({
        data: {
          motivo_cancelacion: motivo,
          fecha_cancelacion: new Date(),
          id_evento: id_evento,
          id_usuario: id_usuario
        }
      });

      // Obtener correos de invitados y enviar email
      const correos = evento.asistencia_evento
        .map((inv: any) => inv.invitados?.correo_invitado)
        .filter((c: any) => c && c.trim() !== '');

      if (correos.length > 0) {
        await this.mailService.enviarAvisoCancelacion(correos, evento, motivo);
      }

      // Eliminar de Google Calendar si estaba sincronizado
      const eventoSync = await this.db.evento_calendar.findFirst({
        where: { id_evento }
      });

      if (eventoSync && eventoSync.google_calendar_id) {
        const usuario = await this.db.usuarios.findUnique({ where: { id_usuario: evento.id_usuario } });
        if (usuario && usuario.google_refresh_token) {
          try {
            const tokensObj = {
              refresh_token: usuario.google_refresh_token,
              access_token: usuario.google_access_token,
            };
            this.oauth2Client.setCredentials(tokensObj);
            const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
            await calendar.events.delete({
              calendarId: 'primary',
              eventId: eventoSync.google_calendar_id
            });
            this.logger.log(`Evento cancelado y eliminado de Google Calendar.`);
          } catch (gErr: any) {
            this.logger.error(`Error al eliminar de Google Calendar tras cancelación: ${gErr.message}`);
          }
        }
      }

      return {
        exito: true,
        mensaje: 'Evento cancelado correctamente y correos enviados.'
      };
    } catch (error: any) {
      this.logger.error(`Error al cancelar evento: ${error.message}`);
      throw new HttpException(`Error al cancelar evento: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async obtenerEstadisticasDashboard() {
    try {
      const now = new Date();
      
      // 1. Eventos esta semana
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      const eventosSemana = await this.db.eventos.count({
        where: {
          fecha_evento: {
            gte: startOfWeek,
            lte: endOfWeek
          },
          id_estatus_evento: { not: 3 } // no cancelados
        }
      });

      // 2. Eventos este a�o
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const endOfYear = new Date(now.getFullYear(), 11, 31);
      
      const eventosAno = await this.db.eventos.count({
        where: {
          fecha_evento: {
            gte: startOfYear,
            lte: endOfYear
          },
          id_estatus_evento: { not: 3 }
        }
      });

      // 3. Asistentes totales
      const asistentesTotales = await this.db.asistencia_evento.count({
        where: { asistencia: true }
      });

      // 4. Datos de la gr�fica (frecuencia mensual a�o actual)
      const eventosMeses = await this.db.eventos.findMany({
        where: {
          fecha_evento: {
            gte: startOfYear,
            lte: endOfYear
          },
          id_estatus_evento: { not: 3 }
        },
        select: { fecha_evento: true }
      });

      const mesesNombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      const conteoPorMes = new Array(12).fill(0);
      eventosMeses.forEach(e => {
        if(e.fecha_evento) {
          conteoPorMes[e.fecha_evento.getMonth()]++;
        }
      });
      const chartData = mesesNombres.map((name, index) => ({
        name,
        eventos: conteoPorMes[index]
      }));

      // 5. Eventos recientes/pr�ximos (4 eventos)
      const eventosRaw = await this.db.eventos.findMany({
        take: 4,
        orderBy: { fecha_evento: 'desc' },
        include: {
          asistencia_evento: true,
          estatus_evento: true
        }
      });

      const eventosRecientes = eventosRaw.map(e => {
        let estadoStr = 'completado';
        if (e.fecha_evento && e.fecha_evento > now) {
          estadoStr = 'proximo';
        }
        
        // Month names for nice display
        const dt = e.fecha_evento;
        let fechaFormat = 'Sin fecha';
        if (dt) {
           const d = dt.getDate().toString().padStart(2, '0');
           const m = mesesNombres[dt.getMonth()];
           const y = dt.getFullYear();
           fechaFormat = `${d} ${m} ${y}`;
        }

        return {
          id: e.id_evento,
          nombre: e.nombre_evento,
          fecha: fechaFormat,
          asistentes: e.asistencia_evento.filter(a => a.asistencia).length,
          estado: estadoStr
        };
      });

      return {
        metrics: {
          eventosSemana,
          eventosAno,
          asistentesTotales
        },
        chartData,
        eventosRecientes
      };
    } catch (error: any) {
      this.logger.error('Error al obtener estadisticas del dashboard: ' + error.message);
      throw new HttpException('Error al obtener estadsticas', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async obtenerReporteEvento(id_evento: number) {
    try {
      const evento = await this.db.eventos.findUnique({
        where: { id_evento },
        include: {
          espacios: true,
          areas: true,
          estatus_evento: true,
          asistencia_evento: true,
          evento_cancelacion: true
        }
      });

      if (!evento) {
        throw new HttpException('Evento no encontrado', HttpStatus.NOT_FOUND);
      }

      const mesesNombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      const dt = evento.fecha_evento;
      let fechaFormat = 'Sin fecha';
      if (dt) {
         fechaFormat = `${dt.getDate().toString().padStart(2, '0')} ${mesesNombres[dt.getMonth()]} ${dt.getFullYear()}`;
      }

      const asistentesConfirmados = evento.asistencia_evento ? evento.asistencia_evento.filter(a => a.asistencia).length : 0;

      // Obtener comentarios de encuestas
      const encuestas = await this.db.encuestas.findMany({
        where: { id_evento },
        include: {
          preguntas_encuesta: {
            include: {
              respuesta_pregunta: true
            }
          }
        }
      });

      const feedbackByInvitado: Record<number, any> = {};

      encuestas.forEach(enc => {
        enc.preguntas_encuesta.forEach(preg => {
          preg.respuesta_pregunta.forEach(resp => {
            if (!feedbackByInvitado[resp.id_invitado]) {
              feedbackByInvitado[resp.id_invitado] = {
                calificacion: 'N/A',
                comentario: '',
                recomendacion: 'N/A',
              };
            }
            if (preg.pregunta === 'Calificacion') {
              feedbackByInvitado[resp.id_invitado].calificacion = resp.respuesta_texto;
            } else if (preg.pregunta === 'Comentarios') {
              feedbackByInvitado[resp.id_invitado].comentario = resp.respuesta_texto;
            } else if (preg.pregunta === 'Recomendacion') {
              feedbackByInvitado[resp.id_invitado].recomendacion = resp.respuesta_texto;
            } else {
                feedbackByInvitado[resp.id_invitado][preg.pregunta] = resp.respuesta_texto;
            }
          });
        });
      });

      const comentarios = Object.values(feedbackByInvitado).filter(f => f.comentario && f.comentario.trim() !== '');

      let motivoCancelacion: string | null = null;
      if (evento.evento_cancelacion && evento.evento_cancelacion.length > 0) {
        // Asumiendo que obtienes el último registro de cancelación si hay múltiples, o solo el primero
        motivoCancelacion = evento.evento_cancelacion[evento.evento_cancelacion.length - 1].motivo_cancelacion;
      }

      return {
        nombre: evento.nombre_evento,
        fecha: fechaFormat,
        ubicacion: evento.espacios?.nombre_espacio || 'Sin ubicación',
        organizador: evento.areas?.nombre_area || 'Sin organizador',
        asistentesEsperados: evento.espacios?.capacidad_espacio || 0,
        asistentesConfirmados: asistentesConfirmados,
        presupuesto: 'N/A', // O mockeado
        estado: evento.estatus_evento?.nombre_estatus || 'Sin estado',
        descripcion: evento.descripcion_evento || 'Sin descripción',
        comentarios: comentarios,
        motivoCancelacion: motivoCancelacion

      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error al obtener reporte del evento: ${error.message}`);
      throw new HttpException('Error al obtener reporte del evento', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
