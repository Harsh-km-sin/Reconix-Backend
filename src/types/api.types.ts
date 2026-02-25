/**
 * Standard API response types for consistent success and error payloads.
 * Use these for all JSON responses to support SOC2/audit and client handling.
 */

/** Successful response envelope */
export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

/** Error response envelope */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/** HTTP status codes commonly used with sendError/sendSuccess */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

/** Standard error codes for clients to handle */
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

import type { Response } from "express";

/** Send a success response with optional status (default 200) */
export function sendSuccess<T>(res: Response, data: T, status: number = 200): void {
  res.status(status).json({ success: true, data } satisfies ApiSuccess<T>);
}

/** Send an error response with code, message, and HTTP status */
export function sendError(
  res: Response,
  code: ErrorCodeType,
  message: string,
  status: number = 500
): void {
  res.status(status).json({
    success: false,
    error: { code, message },
  } satisfies ApiError);
}
