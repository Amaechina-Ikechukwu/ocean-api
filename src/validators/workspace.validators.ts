import { z } from "zod";
import { optionalNullableUrl, safeText, workspaceRoleSchema } from "./common.validators";

export const createWorkspaceSchema = z.object({
  name: safeText(120),
  icon: z.string().trim().min(1).max(16).default("workspace"),
  coverImage: optionalNullableUrl
});

export const updateWorkspaceSchema = z.object({
  name: safeText(120).optional(),
  icon: z.string().trim().min(1).max(16).optional(),
  coverImage: optionalNullableUrl
}).strict();

export const memberUidParam = z.object({
  workspaceId: z.string().min(1).max(160),
  uid: z.string().min(1).max(160)
});

export const updateMemberRoleSchema = z.object({
  role: workspaceRoleSchema.exclude(["owner"])
});

export const createInviteSchema = z.object({
  email: z.string().email().max(320).transform((email) => email.toLowerCase()),
  role: workspaceRoleSchema.exclude(["owner"])
});
