const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const roles = await prisma.roles.findMany();
  console.log('ROLES:', roles);
}
main().catch(console.error).finally(() => prisma.$disconnect());
