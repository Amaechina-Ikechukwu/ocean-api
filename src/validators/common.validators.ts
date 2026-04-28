import { z } from "zod";
import { workspaceRoles } from "../services/permission.service";

export const idParam = z.object({
  workspaceId: z.string().min(1).max(160)
});

export const pageIdParam = z.object({
  pageId: z.string().min(1).max(160)
});

export const blockIdParam = pageIdParam.extend({
  blockId: z.string().min(1).max(160)
});

export const workspaceRoleSchema = z.enum(workspaceRoles);

export const optionalNullableUrl = z.string().url().max(2048).nullable().optional();

export const safeText = (max = 2000) => z.string().trim().min(1).max(max);
