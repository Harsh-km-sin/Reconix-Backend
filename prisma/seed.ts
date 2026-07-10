import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma.js";
import { permissionService } from "../src/modules/permission/permission.service.js";
import { ADMIN_ROLE_NAME } from "../src/types/permissions.js";

const SALT_ROUNDS = 10;

async function main() {
  // 1. Seed RBAC (idempotent): permission catalog + system roles + default grants.
  await permissionService.seedRbac();
  console.log("Seed: RBAC catalog + system roles ready.");

  // 2. Bootstrap the first admin user (only if configured and no users exist).
  const email = process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.FIRST_ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    console.log("Seed: FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD (min 8 chars) not set – skipping admin bootstrap.");
    return;
  }
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log("Seed: Users already exist – skipping admin bootstrap.");
    return;
  }

  const xeroTenantId = process.env.SEED_XERO_TENANT_ID ?? "seed-tenant-1";
  const company = await prisma.company.upsert({
    where: { xeroTenantId },
    create: { name: "Default Company", xeroTenantId },
    update: {},
  });

  const adminRole = await permissionService.findRoleByName(ADMIN_ROLE_NAME);
  if (!adminRole) throw new Error(`Seed: "${ADMIN_ROLE_NAME}" role missing after seedRbac`);

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, name: "Admin", passwordHash, isActive: true },
  });
  await prisma.userCompanyRole.create({
    data: {
      userId: user.id,
      companyId: company.id,
      roleId: adminRole.id,
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
