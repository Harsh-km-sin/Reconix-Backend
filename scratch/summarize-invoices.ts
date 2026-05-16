import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const summary = await prisma.xeroInvoice.groupBy({
    by: ['type'],
    _count: true
  });
  console.log("Database Invoice Summary:");
  console.table(summary);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
