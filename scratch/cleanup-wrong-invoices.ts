import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.xeroInvoice.count({
    where: { type: "ACCREC" }
  });
  console.log(`Found ${count} Sales Invoices (ACCREC) in the database.`);
  
  if (count > 0) {
    const deleted = await prisma.xeroInvoice.deleteMany({
      where: { type: "ACCREC" }
    });
    console.log(`Deleted ${deleted.count} Sales Invoices.`);
  } else {
    console.log("No Sales Invoices found.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
