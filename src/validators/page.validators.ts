import { z } from "zod";
import { optionalNullableUrl, safeText } from "./common.validators";

export const createPageSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  parentPageId: z.string().min(1).max(160).nullable().optional(),
  title: safeText(240).default("Untitled"),
  icon: z.string().trim().min(1).max(16).default("page"),
  coverImage: optionalNullableUrl,
  visibility: z.enum(["private", "workspace", "public"]).default("workspace"),
  order: z.number().finite().optional()
});

export const updatePageSchema = z.object({
  title: safeText(240).optional(),
  icon: z.string().trim().min(1).max(16).optional(),
  coverImage: optionalNullableUrl,
  visibility: z.enum(["private", "workspace", "public"]).optional(),
  order: z.number().finite().optional()
}).strict();

export const movePageSchema = z.object({
  workspaceId: z.string().min(1).max(160).optional(),
  parentPageId: z.string().min(1).max(160).nullable(),
  order: z.number().finite().optional()
});
