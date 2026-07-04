import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log('Conexión a Prisma exitosa.');
    } catch (error) {
      console.error('Error conectando a Prisma:', error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Mantenemos este método temporalmente para compatibilidad con código no refactorizado.
  async query(text: string, params?: any[]) {
    try {
      // Ejecutamos la consulta directa usando Prisma
      const result = await this.$queryRawUnsafe(text, ...(params || []));
      // Simulamos la respuesta original de `pg` que devuelve un objeto { rows: [...] }
      return { rows: Array.isArray(result) ? result : [result] };
    } catch (error: any) {
      console.error(`[DatabaseService ERROR] Error ejecutando consulta cruda:`);
      console.error(`Query: ${text}`);
      console.error(`Params:`, params);
      console.error(`Error Detalle:`, error.message);
      throw error;
    }
  }
}