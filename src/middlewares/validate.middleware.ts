import { Request, Response, NextFunction } from "express";
// Request validation (Zod/Joi) - use per-route in Phase 1 Task 19
// Placeholder: pass through
export function validateMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  next();
}
