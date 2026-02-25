import type { Role } from "@prisma/client";

/**
 * Module names that can be permission-checked.
 * Add new modules here as the API grows.
 */
export const MODULES = [
  "auth",
  "users",
  "companies",
  "xero",
  "invoices",
  "overpayments",
  "jobs",
  "admin",
] as const;

export type Module = (typeof MODULES)[number];

/**
 * Role-to-module mapping: which modules each role can access (read).
 * ADMIN has all; APPROVER and OPERATOR have subset.
 */
export const ROLE_MODULE_PERMISSIONS: Record<Role, readonly Module[]> = {
  ADMIN: [...MODULES],
  APPROVER: ["auth", "users", "companies", "xero", "invoices", "overpayments", "jobs"],
  OPERATOR: ["auth", "users", "invoices", "overpayments", "jobs"],
};

/**
 * Which modules each role can edit (write). Read implies write for ADMIN.
 */
export const ROLE_MODULE_WRITE: Record<Role, readonly Module[]> = {
  ADMIN: [...MODULES],
  APPROVER: ["auth", "users", "companies", "xero", "invoices", "overpayments", "jobs"],
  OPERATOR: ["auth", "invoices", "overpayments", "jobs"], // operator cannot write users/companies/xero
};

/**
 * Permissions for a user with no company role (invited but no assignment).
 */
export const NO_ROLE_MODULES: readonly Module[] = ["auth"];

const WRITE_SUFFIX = ":write";

/** Return permission strings for JWT: module names (read) plus "module:write" for write. */
export function getPermissionsForRole(role: Role | undefined): string[] {
  if (!role) return [...NO_ROLE_MODULES];
  const read = [...ROLE_MODULE_PERMISSIONS[role]];
  const write = [...ROLE_MODULE_WRITE[role]];
  const list: string[] = [...read];
  write.forEach((m) => list.push(`${m}${WRITE_SUFFIX}`));
  return list;
}

/** Check if permissions include read access to the module. */
export function hasModuleAccess(permissions: readonly string[], module: string): boolean {
  return permissions.includes(module);
}

/** Check if permissions include write (editable) access to the module. */
export function hasModuleWriteAccess(permissions: readonly string[], module: string): boolean {
  return permissions.includes(`${module}${WRITE_SUFFIX}`);
}
