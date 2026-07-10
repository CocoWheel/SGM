require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function seedRoles() {
  try {
    await client.connect();
    
    // Add default roles
    const res = await client.query(`
      INSERT INTO roles (nombre_rol, descripcion_rol) 
      VALUES 
        ('Administrador', 'Acceso total al sistema'), 
        ('Usuario', 'Acceso estándar') 
      ON CONFLICT DO NOTHING RETURNING *
    `);
    
    console.log('Roles listos. Roles creados/actualizados:', res.rowCount);
  } catch (err) {
    console.error('Error seeding roles:', err);
  } finally {
    await client.end();
  }
}

seedRoles();
