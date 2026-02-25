import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/index.js";
import { sendError, ErrorCode, HttpStatus } from "../types/api.types.js";
import type { AuthTokenPayload } from "../modules/auth/auth.interface.js";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendError(res, ErrorCode.UNAUTHORIZED, "Missing or invalid Authorization header", HttpStatus.UNAUTHORIZED);
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      companyId: decoded.companyId,
      permissions: decoded.permissions ?? [],
    };
    next();
  } catch {
    sendError(res, ErrorCode.UNAUTHORIZED, "Invalid or expired token", HttpStatus.UNAUTHORIZED);
  }
}
