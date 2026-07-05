const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    // 1. Rename existing to avoid unique constraint on nombre_rol
    await pool.query("UPDATE roles SET nombre_rol = nombre_rol || '_temp'");

    // 2. Insert or update the required roles with correct IDs
    const queries = [
      "INSERT INTO roles (id_rol, nombre_rol, descripcion_rol) OVERRIDING SYSTEM VALUE VALUES (1, 'Root', 'Acceso total y absoluto al sistema') ON CONFLICT (id_rol) DO UPDATE SET nombre_rol = EXCLUDED.nombre_rol, descripcion_rol = EXCLUDED.descripcion_rol",
      "INSERT INTO roles (id_rol, nombre_rol, descripcion_rol) OVERRIDING SYSTEM VALUE VALUES (2, 'Administrador', 'Acceso total al sistema') ON CONFLICT (id_rol) DO UPDATE SET nombre_rol = EXCLUDED.nombre_rol, descripcion_rol = EXCLUDED.descripcion_rol",
      "INSERT INTO roles (id_rol, nombre_rol, descripcion_rol) OVERRIDING SYSTEM VALUE VALUES (3, 'Coordinador', 'Coordinador de eventos') ON CONFLICT (id_rol) DO UPDATE SET nombre_rol = EXCLUDED.nombre_rol, descripcion_rol = EXCLUDED.descripcion_rol",
      "INSERT INTO roles (id_rol, nombre_rol, descripcion_rol) OVERRIDING SYSTEM VALUE VALUES (4, 'Invitado', 'Acceso estándar') ON CONFLICT (id_rol) DO UPDATE SET nombre_rol = EXCLUDED.nombre_rol, descripcion_rol = EXCLUDED.descripcion_rol"
    ];

    for (let q of queries) {
      await pool.query(q);
    }
    console.log('Roles updated successfully');
    
    // Clean up temp ones if any extra
    await pool.query("DELETE FROM roles WHERE nombre_rol LIKE '%_temp'");
    
    const res = await pool.query('SELECT * FROM roles ORDER BY id_rol');
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
