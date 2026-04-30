import { z } from "zod";
import { optionalNullableUrl } from "./common.validators";

const pageTitleSchema = z.string().trim().min(1).max(240);

const createPageRawSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  parentPageId: z.string().min(1).max(160).nullable().optional(),
  parentId: z.string().min(1).max(160).nullable().optional(),
  title: pageTitleSchema.optional(),
  name: pageTitleSchema.optional(),  content: z.any().optional(),  icon: z.string().trim().min(1).max(16).default("page"),
  coverImage: optionalNullableUrl,
  visibility: z.enum(["private", "workspace", "public"]).default("workspace"),
  order: z.number().finite().optional()
});

const normalizeCreatePage = ({ name, parentId, ...data }: z.infer<typeof createPageRawSchema>) => ({
  ...data,
  title: data.title ?? name ?? "Untitled",
  parentPageId: data.parentPageId ?? parentId ?? null
});

export const createPageSchema = createPageRawSchema.transform(normalizeCreatePage);

export const createWorkspacePageSchema = createPageRawSchema.extend({
  workspaceId: z.string().min(1).max(160).optional()
}).transform((value) => normalizeCreatePage({ ...value, workspaceId: value.workspaceId ?? "" }));

export const updatePageSchema = z.object({
  title: pageTitleSchema.optional(),
  name: pageTitleSchema.optional(),
  content: z.any().optional(),
  icon: z.string().trim().min(1).max(16).optional(),
  coverImage: optionalNullableUrl,
  visibility: z.enum(["private", "workspace", "public"]).optional(),
  order: z.number().finite().optional()
}).transform(({ name, ...data }) => {
  const title = data.title ?? name;
  return {
    ...data,
    ...(title === undefined ? {} : { title })
  };
});

export const movePageSchema = z.object({
  workspaceId: z.string().min(1).max(160).optional(),
  parentPageId: z.string().min(1).max(160).nullable(),
  order: z.number().finite().optional()
});
