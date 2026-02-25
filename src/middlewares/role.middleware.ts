import { Request, Response, NextFunction } from "express";
// RBAC enforcement (ADMIN | APPROVER | OPERATOR) in Phase 1 Task 3
// Placeholder: pass through
export function roleMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  next();
}
