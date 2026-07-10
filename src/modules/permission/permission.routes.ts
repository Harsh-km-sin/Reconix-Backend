import { Router } from "express";
import { permissionController } from "./permission.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/requirePermission.middleware.js";
import { PERMISSIONS } from "../../types/permissions.js";

// All RBAC management is gated by the "roles:manage" permission (held by
// Administrator by default, but grantable to any role).
const manage = requirePermission(PERMISSIONS.ROLES_MANAGE);

// GET /api/v1/permissions — the assignable permission catalog.
const permissionRoutes: Router = Router();
permissionRoutes.use(authMiddleware);
permissionRoutes.get("/", manage, permissionController.listPermissions);

// /api/v1/roles — role CRUD + grant editing.
const roleRoutes: Router = Router();
roleRoutes.use(authMiddleware);
roleRoutes.get("/", manage, permissionController.listRoles);
roleRoutes.post("/", manage, permissionController.createRole);
roleRoutes.get("/:id", manage, permissionController.getRole);
roleRoutes.patch("/:id", manage, permissionController.updateRole);
roleRoutes.put("/:id/permissions", manage, permissionController.setRolePermissions);
roleRoutes.delete("/:id", manage, permissionController.deleteRole);

export { permissionRoutes, roleRoutes };
