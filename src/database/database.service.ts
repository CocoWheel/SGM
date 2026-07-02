import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  onModuleInit() {
    // Esto se ejecuta automáticamente cuando arranca el backend
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false, // Obligatorio para que Neon acepte la conexión segura
      },
    });
  }

  // Este método se usará en los otros servicios para mandar los queries SQL
  async query(text: string, params?: any[]) {
    return await this.pool.query(text, params);
  }

  async onModuleDestroy() {
    // Cierra las conexiones limpiamente si apagas el servidor
    await this.pool.end();
  }
}