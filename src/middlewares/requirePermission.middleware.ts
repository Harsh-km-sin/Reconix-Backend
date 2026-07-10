import { Request, Response, NextFunction } from "express";
import { sendError, ErrorCode, HttpStatus } from "../types/api.types.js";
import { hasPermission } from "../types/permissions.js";

/**
 * Gate a route by permission key(s). Passes only if the authenticated user holds
 * ALL of the given keys (from the permissions baked into their JWT). Requires
 * authMiddleware to have run first.
 *
 * This is the single authorization primitive — there is no role-name logic: a
 * user is allowed because their role grants the permission, and grants are
 * fully configurable at runtime.
 */
export function requirePermission(...required: string[]) {
  return function permissionGuard(req: Request, res: Response, next: NextFunction): void {
    const perms = req.user?.permissions;
    if (!perms) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
      return;
    }
    const missing = required.filter((key) => !hasPermission(perms, key));
    if (missing.length > 0) {
      sendError(
        res,
        ErrorCode.FORBIDDEN,
        `Missing required permission: ${missing.join(", ")}`,
        HttpStatus.FORBIDDEN
      );
      return;
    }
    next();
  };
}
