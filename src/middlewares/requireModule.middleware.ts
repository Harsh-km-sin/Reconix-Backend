import { Request, Response, NextFunction } from "express";
import { sendError, ErrorCode, HttpStatus } from "../types/api.types.js";
import { hasModuleAccess, hasModuleWriteAccess } from "../types/permissions.js";
import type { Module } from "../types/permissions.js";

export type RequireModuleOptions = { write?: boolean };

/**
 * Middleware that requires the request to have an authenticated user with
 * permission to access the given module. Use after authMiddleware.
 * - write: true = require edit permission for the module (else 403).
 * Returns 401 if not authenticated, 403 if no access or missing write permission.
 */
export function requireModule(moduleName: Module, options: RequireModuleOptions = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
      return;
    }
    if (!hasModuleAccess(req.user.permissions, moduleName)) {
      sendError(
        res,
        ErrorCode.FORBIDDEN,
        `Access denied: you do not have permission to access ${moduleName}`,
        HttpStatus.FORBIDDEN
      );
      return;
    }
    if (options.write && !hasModuleWriteAccess(req.user.permissions, moduleName)) {
      sendError(
        res,
        ErrorCode.FORBIDDEN,
        `Access denied: you do not have permission to modify ${moduleName}`,
        HttpStatus.FORBIDDEN
      );
      return;
    }
    next();
  };
}
