import { z } from "zod";
import { Role } from "@prisma/client";

const emailSchema = z
  .string()
  .min(1, "Email is required")
  .email("Invalid email address")
  .transform((s) => s.trim().toLowerCase());

const roleSchema = z.nativeEnum(Role);

export const inviteUserSchema = z.object({
  email: emailSchema,
  name: z.string().max(100).optional().transform((s) => s?.trim() || undefined),
  assignments: z
    .array(
      z.object({
        companyId: z.string().min(1, "Company ID is required"),
        role: roleSchema,
      })
    )
    .default([]),
});

/** Profile fields editable by the user (Settings). */
export const updateProfileSchema = z.object({
  name: z.string().max(100).optional().nullable().transform((s) => (s === "" ? null : s?.trim() ?? null)),
  phoneNumber: z.string().max(50).optional().nullable().transform((s) => (s === "" ? null : s?.trim() ?? null)),
  timezone: z.string().max(100).optional().nullable().transform((s) => (s === "" ? null : s ?? null)),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY"]).optional().nullable(),
  preferences: z
    .record(z.string(), z.boolean())
    .optional()
    .nullable(),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
