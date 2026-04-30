import { z } from "zod";

export const blockTypes = [
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list",
  "numbered_list",
  "todo",
  "toggle",
  "quote",
  "callout",
  "divider",
  "code",
  "image",
  "video",
  "audio",
  "file",
  "bookmark",
  "equation",
  "table",
  "columns",
  "database_view",
  "embed",
  "breadcrumb",
  "table_of_contents",
  "synced_block"
] as const;

const contentSchema = z.record(z.unknown()).default({});

export const createBlockSchema = z.object({
  type: z.enum(blockTypes).default("paragraph"),
  content: contentSchema,
  parentBlockId: z.string().min(1).max(160).nullable().optional(),
  order: z.number().finite().optional()
});

export const updateBlockSchema = z.object({
  type: z.enum(blockTypes).optional(),
  content: contentSchema.optional(),
  parentBlockId: z.string().min(1).max(160).nullable().optional(),
  order: z.number().finite().optional()
}).strict();

export const directUpdateBlockSchema = updateBlockSchema.extend({
  pageId: z.string().min(1).max(160)
}).strict();

export const reorderBlocksSchema = z.object({
  blocks: z.array(z.object({
    blockId: z.string().min(1).max(160),
    order: z.number().finite()
  })).min(1).max(500)
});

export const bulkBlocksSchema = z.object({
  create: z.array(createBlockSchema).max(100).optional(),
  update: z.array(z.object({
    blockId: z.string().min(1).max(160),
    data: updateBlockSchema
  })).max(100).optional(),
  delete: z.array(z.string().min(1).max(160)).max(100).optional()
});
