import { Request, Response } from "express";
import { authService } from "./auth.service.js";
import { loginSchema, setPasswordSchema, changePasswordSchema } from "./auth.validation.js";
import { ZodError } from "zod";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../types/api.types.js";
import { auditService } from "../audit/audit.service.js";

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
      
      if (!result.mfaRequired && result.user) {
        await auditService.record({
          companyId: result.companyId || "SYSTEM",
          userId: result.user.id,
          action: "USER_LOGIN",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
      }

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

      await auditService.record({
        companyId: result.companyId || "SYSTEM",
        userId: result.user.id,
        action: "PASSWORD_SET",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

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

      await auditService.record({
        companyId: req.user.companyId || "SYSTEM",
        userId: req.user.userId,
        action: "PASSWORD_CHANGED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

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

  async setupMFA(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
        return;
      }
      const setup = await authService.setupMFA(req.user.userId);
      sendSuccess(res, setup);
    } catch (err) {
      sendError(res, ErrorCode.INTERNAL_ERROR, "MFA setup failed");
    }
  },

  async verifyMFA(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
        return;
      }
      const { token } = req.body;
      if (!token) {
        sendError(res, ErrorCode.VALIDATION_ERROR, "MFA code is required", HttpStatus.BAD_REQUEST);
        return;
      }
      await authService.verifyAndEnableMFA(req.user.userId, token);

      await auditService.record({
        companyId: req.user.companyId || "SYSTEM",
        userId: req.user.userId,
        action: "MFA_ENABLED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "MFA verification failed";
      sendError(res, ErrorCode.VALIDATION_ERROR, message, HttpStatus.BAD_REQUEST);
    }
  },

  async loginVerifyMFA(req: Request, res: Response): Promise<void> {
    try {
      const { mfaToken, token } = req.body;
      if (!mfaToken || !token) {
        sendError(res, ErrorCode.VALIDATION_ERROR, "MFA session token and code are required", HttpStatus.BAD_REQUEST);
        return;
      }
      const result = await authService.verifyMFALogin({ mfaToken, token });

      await auditService.record({
        companyId: result.companyId || "SYSTEM",
        userId: result.user.id,
        action: "USER_LOGIN_MFA",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "MFA verification failed";
      sendError(res, ErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
    }
  },

  async disableMFA(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
        return;
      }
      await authService.disableMFA(req.user.userId);

      await auditService.record({
        companyId: req.user.companyId || "SYSTEM",
        userId: req.user.userId,
        action: "MFA_DISABLED",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, { ok: true });
    } catch (err) {
      sendError(res, ErrorCode.INTERNAL_ERROR, "Disable MFA failed");
    }
  },

  async switchCompany(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
        return;
      }
      const { companyId } = req.body;
      if (!companyId || typeof companyId !== "string") {
        sendError(res, ErrorCode.VALIDATION_ERROR, "companyId is required", HttpStatus.BAD_REQUEST);
        return;
      }
      const result = await authService.switchCompany(req.user.userId, companyId);
      sendSuccess(res, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Switch failed";
      sendError(res, ErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
    }
  },
};
