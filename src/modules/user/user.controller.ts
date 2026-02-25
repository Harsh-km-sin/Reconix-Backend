import { Request, Response } from "express";
import { ZodError } from "zod";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../types/api.types.js";
import { userService } from "./user.service.js";
import { inviteUserSchema, updateProfileSchema } from "./user.validation.js";

function validationError(res: Response, err: ZodError): void {
  const first = err.errors[0];
  const message = first ? `${first.path.join(".")}: ${first.message}` : "Validation failed";
  sendError(res, ErrorCode.VALIDATION_ERROR, message, HttpStatus.BAD_REQUEST);
}

export const userController = {
  async getMe(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
      return;
    }
    const profile = await userService.getMe(req.user.userId);
    if (!profile) {
      sendError(res, ErrorCode.NOT_FOUND, "User not found", HttpStatus.NOT_FOUND);
      return;
    }
    sendSuccess(res, profile);
  },

  async updateMe(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
        return;
      }
      const body = updateProfileSchema.parse(req.body);
      const profile = await userService.updateMe(req.user.userId, body);
      sendSuccess(res, profile);
    } catch (err) {
      if (err instanceof ZodError) {
        validationError(res, err);
        return;
      }
      sendError(res, ErrorCode.INTERNAL_ERROR, "Update profile failed", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  },

  list: (_req: Request, res: Response) => {
    sendSuccess(res, []);
  },

  async invite(req: Request, res: Response): Promise<void> {
    try {
      const body = inviteUserSchema.parse(req.body);
      if (!req.user) {
        sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
        return;
      }
      const result = await userService.invite(
        body,
        req.user.userId,
        req.user.email,
        undefined,
        req.ip ?? req.socket?.remoteAddress
      );
      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (err) {
      if (err instanceof ZodError) {
        validationError(res, err);
        return;
      }
      const message = err instanceof Error ? err.message : "Invite failed";
      if (message.includes("already exists")) {
        sendError(res, ErrorCode.CONFLICT, message, HttpStatus.CONFLICT);
        return;
      }
      if (message.includes("Company not found")) {
        sendError(res, ErrorCode.VALIDATION_ERROR, message, HttpStatus.BAD_REQUEST);
        return;
      }
      sendError(res, ErrorCode.INTERNAL_ERROR, "Invite failed", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  },
};
