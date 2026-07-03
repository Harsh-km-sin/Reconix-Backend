import { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";
import { sendError, ErrorCode, HttpStatus } from "../types/api.types.js";

/**
 * RBAC enforcement (ADMIN | APPROVER | OPERATOR).
 *
 * Returns a middleware that allows the request through only if the
 * authenticated user's role is one of `allowedRoles`. Requires `authMiddleware`
 * to have run first (so `req.user` is populated).
 */
export function requireRole(...allowedRoles: Role[]) {
  return function roleGuard(req: Request, res: Response, next: NextFunction): void {
    const role = req.user?.role;
    if (!role) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
      return;
    }
    if (!allowedRoles.includes(role)) {
      sendError(
        res,
        ErrorCode.FORBIDDEN,
        `Requires one of the following roles: ${allowedRoles.join(", ")}`,
        HttpStatus.FORBIDDEN
      );
      return;
    }
    next();
  };
}
