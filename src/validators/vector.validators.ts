import { z } from "zod";

export const vectorizePageSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  limit: z.number().int().positive().max(500).default(200)
});

export const vectorSearchSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  query: z.string().trim().min(1).max(4000),
  limit: z.number().int().positive().max(25).default(8)
});

export const vectorizeBlockParamsSchema = z.object({
  pageId: z.string().min(1).max(160),
  blockId: z.string().min(1).max(160)
});

export const vectorizeBlockSchema = z.object({
  workspaceId: z.string().min(1).max(160).optional()
});
