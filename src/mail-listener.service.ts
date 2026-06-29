import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Client } from 'pg';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailListenerService implements OnModuleInit, OnModuleDestroy {
  private pgClient: Client;
  private transporter: nodemailer.Transporter;

  constructor() {
    // 1. Configuración de PostgreSQL (Usa variables de Vercel o tus respaldos locales)
    this.pgClient = new Client({
      user: process.env.DB_USER || 'tiffany',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'proyecto1', // ⬅️ Cambia por tu BD local si pruebas en casa
      password: process.env.DB_PASSWORD || '12345678',   // ⬅️ Cambia por tu contraseña local
      port: parseInt(process.env.DB_PORT || '5432'),
    });

    // 2. Configuración de Nodemailer para el envío de correos
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false, // true para puerto 465, false para 587
      auth: {
        user: process.env.EMAIL_USER || 'maxtommon2@gmail.com', // ⬅️ Tu correo de respaldo
        pass: process.env.EMAIL_PASS || 'qexv okyh slrf yqtz',             // ⬅️ Tu token de aplicación de respaldo
      },
    });
  }

  // Se ejecuta automáticamente cuando NestJS enciende
  async onModuleInit() {
    try {
      await this.pgClient.connect();
      console.log('--- 🚀 Conexión exitosa a PostgreSQL para escuchar Triggers ---');

      // Escuchamos el canal 'nuevo_correo' que definimos en el Trigger de Postgres
      await this.pgClient.query('LISTEN nuevo_correo');

      // Nos quedamos oyendo los eventos de la base de datos
      this.pgClient.on('notification', async (msg) => {
        if (msg.channel === 'nuevo_correo' && msg.payload) {
          try {
            // Parseamos los datos en JSON que mandó el Trigger
            const datosNotificacion = JSON.parse(msg.payload);
            console.log('📩 Nueva notificación detectada en la BD:', datosNotificacion);

            // Disparamos el envío del correo electrónico
            await this.enviarCorreo(datosNotificacion);
          } catch (error) {
            console.error('❌ Error al procesar el JSON del trigger:', error);
          }
        }
      });

    } catch (error) {
      console.error('❌ Error al conectar el MailListener de Postgres:', error);
    }
  }

  // Función encargada de estructurar y enviar el email real
  private async enviarCorreo(data: { id_usuario: number; titulo: string; mensaje: string }) {
    try {
      // ⚠️ NOTA: Aquí puedes hacer una consulta rápida a tu tabla de Usuarios 
      // si necesitas obtener el correo real de la persona usando su 'id_usuario'.
      // Por ahora, para probar, lo mandaremos a un correo fijo o al mismo remitente:
      const correoDestino = process.env.EMAIL_USER || 'tu_correo_local@gmail.com';

      const info = await this.transporter.sendMail({
        from: `"Sistema Universitario SGEM" <${process.env.EMAIL_USER || 'tu_correo_local@gmail.com'}>`,
        to: correoDestino, // Aquí pones la variable con el correo del destinatario
        subject: `🔔 ${data.titulo}`, 
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <h2 style="color: #1a73e8;">${data.titulo}</h2>
            <p>Estimado usuario,</p>
            <p style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #1a73e8;">
              ${data.mensaje}
            </p>
            <p style="font-size: 12px; color: #777; margin-top: 20px;">
              Este es un correo automático generado por la Plataforma Gestión de Comunicación Universitaria.
            </p>
          </div>
        `,
      });

      console.log('✅ Correo enviado con éxito. ID:', info.messageId);
    } catch (error) {
      console.error('❌ Error al enviar el correo a través de Nodemailer:', error);
    }
  }

  // Se ejecuta automáticamente si el servidor se apaga para no dejar conexiones colgadas
  async onModuleDestroy() {
    await this.pgClient.end();
    console.log('--- 🛑 Conexión de escucha de PostgreSQL cerrada correctamente ---');
  }
}