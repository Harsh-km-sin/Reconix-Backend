import { prisma } from "../../config/prisma.js";
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
  NO_ROLE_MODULES,
} from "../../types/permissions.js";

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionKeys: string[];
}

// ── permission resolution cache (roleId → keys) ──────────────────────────────
// Per-request authorization reads permissions from the JWT, so this cache is
// only hit when a token is issued (login/switch). Short TTL + explicit
// invalidation on edits keeps runtime changes fresh.
type CacheEntry = { perms: string[]; expires: number };
const permCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

export function invalidatePermissionCache(roleId?: string): void {
  if (roleId) permCache.delete(roleId);
  else permCache.clear();
}

async function loadRole(id: string): Promise<RoleWithPermissions | null> {
  const r = await prisma.role.findUnique({
    where: { id },
    include: { rolePermissions: { select: { permission: { select: { key: true } } } } },
  });
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissionKeys: r.rolePermissions.map((rp) => rp.permission.key),
  };
}

export const permissionService = {
  /** Resolve the permission keys granted to a role id (cached). */
  async resolvePermissions(roleId: string | null | undefined): Promise<string[]> {
    if (!roleId) return [...NO_ROLE_MODULES];
    const cached = permCache.get(roleId);
    if (cached && cached.expires > Date.now()) return cached.perms;

    const rows = await prisma.rolePermission.findMany({
      where: { roleId },
      select: { permission: { select: { key: true } } },
    });
    const perms = rows.map((r) => r.permission.key);
    const result = perms.length ? perms : [...NO_ROLE_MODULES];
    permCache.set(roleId, { perms: result, expires: Date.now() + CACHE_TTL_MS });
    return result;
  },

  /** Full permission catalog (grouped-friendly, for the admin UI). */
  listCatalog() {
    return prisma.permission.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] });
  },

  /** All roles with their permission keys. */
  async listRoles(): Promise<RoleWithPermissions[]> {
    const roles = await prisma.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: { rolePermissions: { select: { permission: { select: { key: true } } } } },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissionKeys: r.rolePermissions.map((rp) => rp.permission.key),
    }));
  },

  getRole(id: string): Promise<RoleWithPermissions | null> {
    return loadRole(id);
  },

  findRoleByName(name: string) {
    return prisma.role.findUnique({ where: { name } });
  },

  async createRole(input: { name: string; description?: string | null; permissionKeys: string[] }) {
    const role = await prisma.role.create({
      data: { name: input.name.trim(), description: input.description ?? null },
    });
    return permissionService.setRolePermissions(role.id, input.permissionKeys);
  },

  async updateRole(id: string, input: { name?: string; description?: string | null }) {
    await prisma.role.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        description: input.description,
      },
    });
    return loadRole(id);
  },

  /** Replace a role's permission grants with exactly the given keys. */
  async setRolePermissions(roleId: string, keys: string[]): Promise<RoleWithPermissions | null> {
    const perms = await prisma.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId, permissionId: p.id })),
      }),
    ]);
    invalidatePermissionCache(roleId);
    return loadRole(roleId);
  },

  async deleteRole(id: string): Promise<void> {
    const role = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { userCompanyRoles: true } } },
    });
    if (!role) throw new Error("Role not found");
    if (role.isSystem) throw new Error("System roles cannot be deleted");
    if (role._count.userCompanyRoles > 0) throw new Error("Role is assigned to users and cannot be deleted");
    await prisma.role.delete({ where: { id } });
    invalidatePermissionCache(id);
  },

  /** Idempotently seed the permission catalog, system roles, and their grants. */
  async seedRbac(): Promise<void> {
    for (const p of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { key: p.key },
        update: { category: p.category, description: p.description },
        create: { key: p.key, category: p.category, description: p.description },
      });
    }
    for (const def of SYSTEM_ROLES) {
      const role = await prisma.role.upsert({
        where: { name: def.name },
        update: { description: def.description, isSystem: true },
        create: { name: def.name, description: def.description, isSystem: true },
      });
      await permissionService.setRolePermissions(role.id, def.permissionKeys);
    }
  },
};
