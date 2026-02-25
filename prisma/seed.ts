import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  const email = process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.FIRST_ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    console.log("Seed: FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD (min 8 chars) not set – skipping bootstrap.");
    return;
  }
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log("Seed: Users already exist – skipping bootstrap.");
    return;
  }
  const xeroTenantId = process.env.SEED_XERO_TENANT_ID ?? "seed-tenant-1";
  const company = await prisma.company.upsert({
    where: { xeroTenantId },
    create: {
      name: "Default Company",
      xeroTenantId,
    },
    update: {},
  });
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email,
      name: "Admin",
      passwordHash,
      isActive: true,
    },
  });
  await prisma.userCompanyRole.create({
    data: {
      userId: user.id,
      companyId: company.id,
      role: "ADMIN",
      grantedAt: new Date(),
    },
  });
  console.log("Seed: First admin created:", user.email);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
