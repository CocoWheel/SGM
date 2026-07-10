import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  private async send({
    to,
    subject,
    html,
    icalEvent,
  }: {
    to: string;
    subject: string;
    html: string;
    icalEvent?: any;
  }) {
    try {
      const mailOptions: any = {
        from: `"SGM - Sistema de Gestión Madero" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
      };
      if (icalEvent) {
        mailOptions.icalEvent = icalEvent;
      }
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        ` Correo enviado con éxito a ${to}. ID: ${info.messageId}`,
      );
    } catch (error: any) {
      this.logger.error(` Error enviando correo a ${to}: ${error.message}`);
    }
  }

  async enviarNotificacionAdmin(evento: any, areasText: string) {
    const adminEmail = process.env.EMAIL_ADMIN || 'cocowheel3@gmail.com';
    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #4285f4;"> Alerta de Sistema: Nuevo Registro</h2>
        <p>Se ha registrado un nuevo evento en la plataforma.</p>
        <p><strong>Evento:</strong> ${evento.nombre_evento} (ID: ${evento.id_evento})<br><strong>Coordinador:</strong> ${evento.correo_coordinador}</p>
      </div>
    `;
    await this.send({
      to: adminEmail,
      subject: `[SGM] Registro de Evento ID: ${evento.id_evento}`,
      html,
    });
  }

  async enviarConfirmacionCoordinador(evento: any) {
    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #34a853;"> Tu evento ha sido registrado</h2>
        <p>Estimado(a) <strong>${evento.nombre_coordinador}</strong>, su solicitud para el evento <strong>"${evento.nombre_evento}"</strong> fue guardada correctamente.</p>
        <p>Se ha notificado al área de Cobertura (Gelasio) y a los departamentos de apoyo seleccionados.</p>
      </div>
    `;
    await this.send({
      to: evento.correo_coordinador,
      subject: `Confirmación de Registro - ${evento.nombre_evento}`,
      html,
    });
  }

  async enviarNotificacionGelasio(evento: any, areasText: string) {
    const gelasioEmail =
      process.env.EMAIL_GELASIO || 'gelasio.reyes@umad.edu.mx';
    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #fcfcfc;">
        <h2 style="color: #f4b400;"> Solicitud de Cobertura y Agenda</h2>
        <p>Hola Gelasio, hay un nuevo evento que requiere ser integrado al calendario institucional:</p>
        <div style="background: #ffffff; padding: 15px; border-left: 4px solid #f4b400; margin: 15px 0; border: 1px solid #eee; border-left: 4px solid #f4b400;">
          <strong>Título del Evento:</strong> ${evento.nombre_evento}<br>
          <strong>Descripción:</strong> ${evento.descripcion_evento}<br>
          <strong>Objetivo:</strong> ${evento.objetivo_evento}<br>
          <strong>Fecha:</strong> ${evento.fecha_evento}<br>
          <strong>Horario:</strong> ${evento.horainicio_evento} - ${evento.horafin_evento}<br><br>
          <strong>Solicitante (Coordinador):</strong> ${evento.nombre_coordinador} (${evento.correo_coordinador})<br>
          <strong>Áreas de Apoyo Solicitadas:</strong> ${areasText}
        </div>
      </div>
    `;
    await this.send({
      to: gelasioEmail,
      subject: ` Cobertura de Evento - ${evento.nombre_evento}`,
      html,
    });
  }

  async enviarNotificacionArea(emailArea: string, evento: any) {
    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #db4437;"> Solicitud de Apoyo de Departamento</h2>
        <p>Se ha solicitado el apoyo de su área para el desarrollo del siguiente evento:</p>
        <blockquote style="background: #f8f9fa; padding: 15px; border-left: 4px solid #db4437; margin: 15px 0;">
          <strong>Evento:</strong> ${evento.nombre_evento}<br>
          <strong>Descripción:</strong> ${evento.descripcion_evento}<br>
          <strong>Fecha y Hora:</strong> ${evento.fecha_evento} a las ${evento.horainicio_evento}<br><br>
          <strong>Contacto Coordinador:</strong> ${evento.correo_coordinador}
        </blockquote>
      </div>
    `;
    await this.send({
      to: emailArea,
      subject: `Solicitud de Apoyo Institucional - ${evento.nombre_evento}`,
      html,
    });
  }

  async enviarInvitacionesInvitados(evento: any, invitados: any[]) {
    if (!invitados || invitados.length === 0) return;

    for (const invitado of invitados) {
      if (!invitado.correo_invitado) continue;
      
      try {
        const correo = invitado.correo_invitado;
        
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

        const fechaInicio = new Date(`${fechaStr}T${horaInicioStr}-06:00`);
        const fechaFin = new Date(`${fechaStr}T${horaFinStr}-06:00`);

        const formatDateForIcal = (date: Date) => {
          if (isNaN(date.getTime())) return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
          return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };

        const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SGM//Sistema de Gestion Madero//ES
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:evento-${evento.id_evento}@sgm.local
DTSTAMP:${formatDateForIcal(new Date())}
DTSTART:${formatDateForIcal(fechaInicio)}
DTEND:${formatDateForIcal(fechaFin)}
SUMMARY:${evento.nombre_evento}
DESCRIPTION:${evento.descripcion_evento || ''}
LOCATION:${evento.nombre_espacio || 'Campus Universitario'}
ORGANIZER;CN="Sistema SGM":mailto:${process.env.EMAIL_USER}
ATTENDEE;RSVP=TRUE:mailto:${correo}
END:VEVENT
END:VCALENDAR`;

        const html = `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #4285f4;"> Nuevo Evento Agendado</h2>
            <p>Hola ${invitado.nombre_invitado || ''}, se ha registrado un nuevo evento en el sistema.</p>
            <p><strong>Evento:</strong> ${evento.nombre_evento}<br>
            <strong>Descripción:</strong> ${evento.descripcion_evento}<br>
            <strong>Fecha:</strong> ${fechaStr}<br>
            <strong>Horario:</strong> ${horaInicioStr} - ${horaFinStr}<br>
            <strong>Espacio:</strong> ${evento.nombre_espacio || 'Por asignar'}</p>
            <p>Se adjunta la invitación para tu calendario.</p>
          </div>
        `;

        await this.send({
          to: correo,
          subject: `[SGM] Invitación a Evento: ${evento.nombre_evento}`,
          html,
          icalEvent: {
            filename: 'invitacion.ics',
            method: 'request',
            content: icalContent
          }
        });
      } catch (e: any) {
        this.logger.error(` Error al preparar invitación a invitado ${invitado.correo_invitado}: ${e.message}`);
      }
    }
  }

  // ⏰ NUEVO MÉTODO: Recordatorios dinámicos con botones de acción
  async enviarRecordatorioCoordinador(
    evento: any,
    tiempoRestanteTexto: string,
  ) {
    // Cuando tengas tu URL final (del Frontend o del Backend), la cambias aquí
    const URL_BASE_APP = process.env.URL_FRONTEND || 'http://localhost:3000';
    const urlConfirmar = `${URL_BASE_APP}/eventos/confirmar/${evento.id_evento}`;
    const urlCancelar = `${URL_BASE_APP}/eventos/cancelar/${evento.id_evento}`;

    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a73e8; text-align: center;"> Recordatorio de Evento Próximo</h2>
        <p>Estimado(a) <strong>${evento.nombre_coordinador}</strong>,</p>
        <p>Te recordamos que tu evento está programado para dentro de **${tiempoRestanteTexto}**.</p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #1a73e8; margin: 20px 0; border: 1px solid #eee; border-left: 4px solid #1a73e8;">
          <strong>Evento:</strong> ${evento.nombre_evento}<br>
          <strong>Fecha:</strong> ${evento.fecha_evento}<br>
          <strong>Horario:</strong> ${evento.horainicio_evento} - ${evento.horafin_evento}<br>
          <strong>Espacio:</strong> ${evento.nombre_espacio || 'Espacio Asignado'}
        </div>

        <p style="text-align: center; font-weight: bold; margin-top: 25px;">¿Sigue en pie el evento? Por favor, confirma o cancela la reservación para liberar el espacio si no se usará:</p>
        
        <div style="text-align: center; margin: 25px 0;">
          <a href="${urlConfirmar}" style="background-color: #34a853; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 5px; margin-right: 15px; display: inline-block;">
             Confirmar Evento
          </a>
          <a href="${urlCancelar}" style="background-color: #db4437; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 5px; display: inline-block;">
             Cancelar Evento
          </a>
        </div>
        
        <p style="font-size: 11px; color: #777; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
          Este es un mensaje automático generado por el Sistema de Gestión Madero (SGM).
        </p>
      </div>
    `;

    await this.send({
      to: evento.correo_coordinador,
      subject: ` Recordatorio (${tiempoRestanteTexto}) - ${evento.nombre_evento}`,
      html,
    });
  }

  async enviarAvisoCancelacion(correos: string[], evento: any, motivo: string) {
    if (!correos || correos.length === 0) return;

    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #db4437; text-align: center; border-bottom: 2px solid #db4437; padding-bottom: 10px;">Evento Cancelado</h2>
        <p>Hola,</p>
        <p>Te informamos que el evento <strong>${evento.nombre_evento}</strong>, programado para el <strong>${evento.fecha_evento}</strong>, ha sido <strong>cancelado</strong>.</p>
        <p><strong>Motivo de la cancelación:</strong></p>
        <blockquote style="background: #f9f9f9; border-left: 5px solid #ccc; margin: 1.5em 10px; padding: 0.5em 10px; font-style: italic;">
          ${motivo}
        </blockquote>
        <p>Lamentamos los inconvenientes que esto pueda ocasionarte.</p>
      </div>
    `;

    try {
      await this.send({
        to: correos.join(','),
        subject: `🚨 Evento Cancelado: ${evento.nombre_evento}`,
        html,
      });
      this.logger.log(`Correo de cancelación enviado a ${correos.length} asistentes.`);
    } catch (error: any) {
      this.logger.error(`Error al enviar correo de cancelación: ${error.message}`);
    }
  }

  async enviarInvitacionAInvitado(correo: string, evento: any) {
    if (!correo) return;

    let fechaFormateada = evento.fecha_evento;
    if (fechaFormateada instanceof Date) {
      fechaFormateada = fechaFormateada.toISOString().split('T')[0];
    } else if (typeof fechaFormateada === 'string' && fechaFormateada.includes('T')) {
      fechaFormateada = fechaFormateada.split('T')[0];
    }

    const horaInicioStr = (evento.horainicio_evento || '00:00').length === 5 ? `${evento.horainicio_evento}:00` : evento.horainicio_evento;
    const horaFinStr = (evento.horafin_evento || '00:00').length === 5 ? `${evento.horafin_evento}:00` : evento.horafin_evento;

    const fechaInicio = new Date(`${fechaFormateada}T${horaInicioStr}-06:00`);
    const fechaFin = new Date(`${fechaFormateada}T${horaFinStr}-06:00`);

    const formatDateForURL = (date: Date) => {
      if (isNaN(date.getTime())) return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const dates = `${formatDateForURL(fechaInicio)}/${formatDateForURL(fechaFin)}`;
    const text = encodeURIComponent(evento.nombre_evento || '');
    const details = encodeURIComponent(evento.descripcion_evento || '');
    const location = encodeURIComponent(evento.nombre_espacio || '');
    
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;

    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px;">
        <h2 style="color: #2b579a; text-align: center; border-bottom: 2px solid #2b579a; padding-bottom: 10px;">Invitación a Evento</h2>
        <p>Hola,</p>
        <p>Has sido cordialmente invitado al evento <strong>${evento.nombre_evento}</strong>.</p>
        <p><strong>Fecha:</strong> ${fechaFormateada}</p>
        <p><strong>Hora:</strong> ${evento.horainicio_evento} a ${evento.horafin_evento}</p>
        <p>Guarda la fecha en tu calendario para que no te lo pierdas.</p>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${googleCalendarUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #4285f4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Agregar a Google Calendar</a>
        </div>
      </div>
    `;

    try {
      await this.send({
        to: correo,
        subject: `Invitación al evento: ${evento.nombre_evento}`,
        html,
      });
      this.logger.log(`Invitación por correo enviada a ${correo}.`);
    } catch (error: any) {
      this.logger.error(`Error al enviar invitación por correo a ${correo}: ${error.message}`);
    }
  }
}
