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

/**
 * Fine-grained capabilities beyond module read/write. These gate specific
 * actions and are toggled per role independently of module access.
 */
export const CAPABILITIES = {
  /**
   * Approve (and thereby run) a job you created yourself — i.e. an authorised
   * exception to the four-eyes principle. Grant this only to roles trusted to
   * self-authorise their own financial operations.
   */
  SELF_APPROVE_JOBS: "jobs:self-approve",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

/**
 * Which capabilities each role holds. This is the single place to enable or
 * disable self-approval (and future capabilities) per role.
 */
export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  ADMIN: [CAPABILITIES.SELF_APPROVE_JOBS], // full control: may approve/run their own jobs
  APPROVER: [], // must have a second approver for jobs they created
  OPERATOR: [],
};

const WRITE_SUFFIX = ":write";

/** Return permission strings for JWT: module names (read), "module:write", and capabilities. */
export function getPermissionsForRole(role: Role | undefined): string[] {
  if (!role) return [...NO_ROLE_MODULES];
  const read = [...ROLE_MODULE_PERMISSIONS[role]];
  const write = [...ROLE_MODULE_WRITE[role]];
  const capabilities = [...ROLE_CAPABILITIES[role]];
  const list: string[] = [...read];
  write.forEach((m) => list.push(`${m}${WRITE_SUFFIX}`));
  list.push(...capabilities);
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

/** Check if permissions include a specific capability/permission string. */
export function hasPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission);
}
