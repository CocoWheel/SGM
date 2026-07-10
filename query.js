const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const eventos = await prisma.eventos.findMany({
    select: { id_evento: true, nombre_evento: true }
  });
  console.log('Eventos in DB:', eventos);
}

main().finally(() => prisma.$disconnect());
