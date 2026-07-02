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

  private async send({ to, subject, html }: { to: string; subject: string; html: string }) {
    try {
      const info = await this.transporter.sendMail({
        from: `"SGM - Sistema de Gestion Madero" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
      });
      this.logger.log(` Correo enviado con éxito a ${to}. ID: ${info.messageId}`);
    } catch (error: any) { // <-- Agrega ": any" justo aquí
    this.logger.error(` Error enviando correo a ${to}: ${error.message}`);
  }
  }

  async enviarNotificacionAdmin(evento: any, areasText: string) {
    const adminEmail = process.env.EMAIL_ADMIN || 'cocowheel3@gmail.com';
    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #4285f4;">💻 Alerta de Sistema: Nuevo Registro</h2>
        <p>Se ha registrado un nuevo evento en la plataforma.</p>
        <p><strong>Evento:</strong> ${evento.nombre_evento} (ID: ${evento.id_evento})<br><strong>Coordinador:</strong> ${evento.correo_coordinador}</p>
      </div>
    `;
    await this.send({ to: adminEmail, subject: `[SGM] Registro de Evento ID: ${evento.id_evento}`, html });
  }

  async enviarConfirmacionCoordinador(evento: any) {
    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #34a853;">✅ Tu evento ha sido registrado</h2>
        <p>Estimado(a) <strong>${evento.nombre_coordinador}</strong>, su solicitud para el evento <strong>"${evento.nombre_evento}"</strong> fue guardada correctamente.</p>
        <p>Se ha notificado al área de Cobertura (Gelasio) y a los departamentos de apoyo seleccionados.</p>
      </div>
    `;
    await this.send({ to: evento.correo_coordinador, subject: `Confirmación de Registro - ${evento.nombre_evento}`, html });
  }

  async enviarNotificacionGelasio(evento: any, areasText: string) {
    const gelasioEmail = process.env.EMAIL_GELASIO || 'gelasio.reyes@umad.edu.mx';
    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #fcfcfc;">
        <h2 style="color: #f4b400;">📅 Solicitud de Cobertura y Agenda</h2>
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
    await this.send({ to: gelasioEmail, subject: `🚨 Cobertura de Evento - ${evento.nombre_evento}`, html });
  }

  async enviarNotificacionArea(emailArea: string, evento: any) {
    const html = `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #db4437;">🛠️ Solicitud de Apoyo de Departamento</h2>
        <p>Se ha solicitado el apoyo de su área para el desarrollo del siguiente evento:</p>
        <blockquote style="background: #f8f9fa; padding: 15px; border-left: 4px solid #db4437; margin: 15px 0;">
          <strong>Evento:</strong> ${evento.nombre_evento}<br>
          <strong>Descripción:</strong> ${evento.descripcion_evento}<br>
          <strong>Fecha y Hora:</strong> ${evento.fecha_evento} a las ${evento.horainicio_evento}<br><br>
          <strong>Contacto Coordinador:</strong> ${evento.correo_coordinador}
        </blockquote>
      </div>
    `;
    await this.send({ to: emailArea, subject: `Solicitud de Apoyo Institucional - ${evento.nombre_evento}`, html });
  }
}