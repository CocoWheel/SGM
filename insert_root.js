require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function insertRoot() {
  try {
    await client.connect();
    const res = await client.query(`
      INSERT INTO roles (nombre_rol, descripcion_rol) 
      VALUES ('Root', 'Acceso total y absoluto al sistema') 
      ON CONFLICT DO NOTHING RETURNING *
    `);
    console.log('Rol Root insertado:', res.rowCount);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

insertRoot();
