import { Request, Response, NextFunction } from "express";
// Rate limiting (e.g. auth endpoints) in Phase 1 Task 19
// Placeholder: pass through
export function rateLimiterMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  next();
}
