import { Request, Response } from "express";
import { authService } from "./auth.service.js";
import { loginSchema, setPasswordSchema, changePasswordSchema } from "./auth.validation.js";
import { ZodError } from "zod";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../types/api.types.js";

function validationError(res: Response, err: ZodError): void {
  const first = err.errors[0];
  const message = first ? `${first.path.join(".")}: ${first.message}` : "Validation failed";
  sendError(res, ErrorCode.VALIDATION_ERROR, message, HttpStatus.BAD_REQUEST);
}

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const body = loginSchema.parse(req.body);
      const result = await authService.login(body);
      sendSuccess(res, result);
    } catch (err) {
      if (err instanceof ZodError) {
        validationError(res, err);
        return;
      }
      const message = err instanceof Error ? err.message : "Login failed";
      if (message === "Invalid email or password" || message.includes("set your password")) {
        sendError(res, ErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
        return;
      }
      sendError(res, ErrorCode.INTERNAL_ERROR, "Login failed", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  },

  async setPassword(req: Request, res: Response): Promise<void> {
    try {
      const body = setPasswordSchema.parse(req.body);
      const result = await authService.setPassword(body);
      sendSuccess(res, result);
    } catch (err) {
      if (err instanceof ZodError) {
        validationError(res, err);
        return;
      }
      const message = err instanceof Error ? err.message : "Set password failed";
      if (message.includes("Invalid or expired") || message.includes("expired")) {
        sendError(res, ErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
        return;
      }
      sendError(res, ErrorCode.INTERNAL_ERROR, "Set password failed", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  },

  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
        return;
      }
      const body = changePasswordSchema.parse(req.body);
      await authService.changePassword(req.user.userId, body.currentPassword, body.newPassword);
      sendSuccess(res, { ok: true });
    } catch (err) {
      if (err instanceof ZodError) {
        validationError(res, err);
        return;
      }
      const message = err instanceof Error ? err.message : "Change password failed";
      if (message.includes("Current password is incorrect") || message.includes("Invalid or missing")) {
        sendError(res, ErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
        return;
      }
      sendError(res, ErrorCode.INTERNAL_ERROR, "Change password failed", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  },
};
