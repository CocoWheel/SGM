const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_s6Ak1cCVxZXF@ep-damp-union-atcntkli-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const queries = `
      CREATE TABLE IF NOT EXISTS Planteles (
        id_plantel SERIAL PRIMARY KEY,
        nombre_plantel VARCHAR(255) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS Espacios (
        id_espacio SERIAL PRIMARY KEY,
        nombre_espacio VARCHAR(255) NOT NULL,
        id_plantel INT
      );

      CREATE TABLE IF NOT EXISTS Areas (
        id_area SERIAL PRIMARY KEY,
        nombre_area VARCHAR(255) NOT NULL,
        correocontacto_area VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS Proveedores (
        id_proveedor SERIAL PRIMARY KEY,
        nombre_proveedor VARCHAR(255) NOT NULL,
        correo_proveedor VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS Eventos (
        id_evento SERIAL PRIMARY KEY,
        nombre_evento VARCHAR(255) NOT NULL,
        descripcion_evento TEXT,
        objetivo_evento TEXT,
        publicoobjetivo_eventos VARCHAR(255),
        fecha_evento DATE,
        horainicio_evento TIME,
        horafin_evento TIME,
        horapreparacion_evento TIME,
        id_prioridad INT,
        id_estatus_evento INT,
        id_usuario INT,
        id_plantel INT,
        id_espacio INT,
        id_area_solicitante INT
      );

      CREATE TABLE IF NOT EXISTS Evento_Area (
        id_evento_area SERIAL PRIMARY KEY,
        id_evento INT,
        id_area INT,
        estatus_eventoa VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS Evento_Calendar (
        id_evento_calendar SERIAL PRIMARY KEY,
        id_evento INT,
        google_calendar_id VARCHAR(255),
        sincronizado BOOLEAN,
        fecha_sincronizacion TIMESTAMP,
        oauth_email VARCHAR(255)
      );
    `;
    await pool.query(queries);
    console.log("Tablas faltantes creadas exitosamente.");
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
