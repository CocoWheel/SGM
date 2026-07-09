require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO planteles (nombre_plantel) 
      VALUES ('UMAD'), ('IMM Centro'), ('IMM Zavaleta')
      ON CONFLICT DO NOTHING
    `);
    console.log('Inserted missing planteles.');
    
    // Check what is in the db now
    const res = await client.query('SELECT * FROM planteles');
    console.log('Planteles:', res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
