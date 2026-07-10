/**
 * Module names that can be permission-checked (bare key = read access).
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

const WRITE_SUFFIX = ":write";

/**
 * Action permission keys (beyond simple module read/write).
 * These are the strings checked by requirePermission and the frontend.
 */
export const PERMISSIONS = {
  JOBS_APPROVE: "jobs:approve", // approve / retry / cancel job execution
  JOBS_DELETE: "jobs:delete",
  ROLES_MANAGE: "roles:manage", // view + edit role→permission mapping
} as const;

export type PermissionKey = string;

export interface PermissionDef {
  key: string;
  category: string;
  description: string;
}

/**
 * The full catalog of permissions the system understands. This is the source
 * of truth for what CAN be granted; which roles actually HAVE each permission
 * lives in the database (role_permissions) and is editable at runtime.
 */
export const PERMISSION_CATALOG: PermissionDef[] = [
  ...MODULES.flatMap((m): PermissionDef[] => [
    { key: m, category: m, description: `Read access to ${m}` },
    { key: `${m}${WRITE_SUFFIX}`, category: m, description: `Write access to ${m}` },
  ]),
  { key: PERMISSIONS.JOBS_APPROVE, category: "jobs", description: "Approve, retry, and cancel job execution" },
  { key: PERMISSIONS.JOBS_DELETE, category: "jobs", description: "Delete jobs" },
  { key: PERMISSIONS.ROLES_MANAGE, category: "admin", description: "View and edit role permissions" },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_CATALOG.map((p) => p.key);

export interface SystemRoleDef {
  name: string;
  description: string;
  permissionKeys: string[];
}

/**
 * Built-in roles seeded into the database (isSystem = true). After seeding,
 * their grants can be changed at runtime via the role API, and brand-new roles
 * can be created — none of this is hardcoded beyond these defaults.
 *
 * Four-eyes is intentionally NOT special-cased: whoever holds jobs:approve may
 * approve any job, including their own.
 */
export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    name: "Administrator",
    description: "Full access to every feature, including role management.",
    permissionKeys: [...ALL_PERMISSION_KEYS],
  },
  {
    name: "Approver",
    description: "Can review and approve/execute jobs, and manage core data.",
    permissionKeys: [
      "auth", "users", "companies", "xero", "invoices", "overpayments", "jobs",
      "auth:write", "users:write", "companies:write", "xero:write", "invoices:write", "overpayments:write", "jobs:write",
      PERMISSIONS.JOBS_APPROVE,
    ],
  },
  {
    name: "Operator",
    description: "Can build jobs and manage data, but cannot approve or delete jobs.",
    permissionKeys: [
      "auth", "users", "invoices", "overpayments", "jobs",
      "auth:write", "invoices:write", "overpayments:write", "jobs:write",
    ],
  },
];

/** Name of the role granted to the bootstrap admin and to full-access users. */
export const ADMIN_ROLE_NAME = "Administrator";

/**
 * Permissions for a user with no company role (invited but no assignment).
 */
export const NO_ROLE_MODULES: readonly string[] = ["auth"];

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
