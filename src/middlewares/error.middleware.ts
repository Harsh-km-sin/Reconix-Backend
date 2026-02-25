import { Request, Response, NextFunction } from "express";
import { logger } from "../config/index.js";
import { sendError, ErrorCode, HttpStatus } from "../types/api.types.js";

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(err.message, { stack: err.stack });
  const message =
    process.env.NODE_ENV === "development" ? err.message : "Internal server error";
  sendError(res, ErrorCode.INTERNAL_ERROR, message, HttpStatus.INTERNAL_SERVER_ERROR);
}
