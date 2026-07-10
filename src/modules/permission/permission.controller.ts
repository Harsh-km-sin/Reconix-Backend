import { Request, Response } from "express";
import { permissionService } from "./permission.service.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../types/api.types.js";
import { logger } from "../../config/index.js";

export const permissionController = {
  /** GET /permissions — the full catalog of assignable permissions. */
  async listPermissions(_req: Request, res: Response): Promise<void> {
    try {
      const perms = await permissionService.listCatalog();
      sendSuccess(res, perms);
    } catch (err) {
      logger.error("Failed to list permissions", { err });
      sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to list permissions");
    }
  },

  /** GET /roles — all roles with their granted permission keys. */
  async listRoles(_req: Request, res: Response): Promise<void> {
    try {
      sendSuccess(res, await permissionService.listRoles());
    } catch (err) {
      logger.error("Failed to list roles", { err });
      sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to list roles");
    }
  },

  /** GET /roles/:id */
  async getRole(req: Request, res: Response): Promise<void> {
    try {
      const role = await permissionService.getRole(req.params.id);
      if (!role) {
        sendError(res, ErrorCode.NOT_FOUND, "Role not found", HttpStatus.NOT_FOUND);
        return;
      }
      sendSuccess(res, role);
    } catch (err) {
      logger.error("Failed to get role", { err });
      sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to get role");
    }
  },

  /** POST /roles — create a role with an initial permission set. */
  async createRole(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, permissionKeys } = req.body as {
        name?: string;
        description?: string;
        permissionKeys?: string[];
      };
      if (!name || typeof name !== "string" || !name.trim()) {
        sendError(res, ErrorCode.VALIDATION_ERROR, "Role name is required", HttpStatus.BAD_REQUEST);
        return;
      }
      const role = await permissionService.createRole({
        name,
        description: description ?? null,
        permissionKeys: Array.isArray(permissionKeys) ? permissionKeys : [],
      });
      sendSuccess(res, role, HttpStatus.CREATED);
    } catch (err: any) {
      if (err?.code === "P2002") {
        sendError(res, ErrorCode.CONFLICT, "A role with this name already exists", HttpStatus.CONFLICT);
        return;
      }
      logger.error("Failed to create role", { err });
      sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to create role");
    }
  },

  /** PATCH /roles/:id — rename / redescribe. */
  async updateRole(req: Request, res: Response): Promise<void> {
    try {
      const { name, description } = req.body as { name?: string; description?: string };
      const role = await permissionService.updateRole(req.params.id, { name, description });
      if (!role) {
        sendError(res, ErrorCode.NOT_FOUND, "Role not found", HttpStatus.NOT_FOUND);
        return;
      }
      sendSuccess(res, role);
    } catch (err: any) {
      if (err?.code === "P2002") {
        sendError(res, ErrorCode.CONFLICT, "A role with this name already exists", HttpStatus.CONFLICT);
        return;
      }
      logger.error("Failed to update role", { err });
      sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to update role");
    }
  },

  /** PUT /roles/:id/permissions — replace the role's grants. */
  async setRolePermissions(req: Request, res: Response): Promise<void> {
    try {
      const { permissionKeys } = req.body as { permissionKeys?: string[] };
      if (!Array.isArray(permissionKeys)) {
        sendError(res, ErrorCode.VALIDATION_ERROR, "permissionKeys array is required", HttpStatus.BAD_REQUEST);
        return;
      }
      const role = await permissionService.setRolePermissions(req.params.id, permissionKeys);
      if (!role) {
        sendError(res, ErrorCode.NOT_FOUND, "Role not found", HttpStatus.NOT_FOUND);
        return;
      }
      sendSuccess(res, role);
    } catch (err) {
      logger.error("Failed to set role permissions", { err });
      sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to set role permissions");
    }
  },

  /** DELETE /roles/:id — non-system roles not in use. */
  async deleteRole(req: Request, res: Response): Promise<void> {
    try {
      await permissionService.deleteRole(req.params.id);
      sendSuccess(res, { message: "Role deleted" });
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Failed to delete role";
      sendError(res, ErrorCode.VALIDATION_ERROR, message, HttpStatus.BAD_REQUEST);
    }
  },
};
