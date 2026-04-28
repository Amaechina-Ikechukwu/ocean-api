import { z } from "zod";

const aiMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(20000)
});

export const aiChatSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  pageId: z.string().min(1).max(160).optional(),
  messages: z.array(aiMessageSchema).min(1).max(50),
  selectedText: z.string().max(20000).optional(),
  mode: z.enum(["ask", "explain", "brainstorm", "draft"]).default("ask")
});

export const summarizePageSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  style: z.enum(["brief", "detailed", "action_items"]).default("brief")
});

export const rewriteSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  selectedText: z.string().trim().min(1).max(20000),
  instruction: z.enum([
    "improve",
    "shorten",
    "expand",
    "fix_grammar",
    "make_professional",
    "make_casual",
    "custom"
  ]),
  customInstruction: z.string().trim().min(1).max(2000).optional()
}).refine((value) => value.instruction !== "custom" || value.customInstruction, {
  message: "customInstruction is required when instruction is custom",
  path: ["customInstruction"]
});

export const generatePageSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  prompt: z.string().trim().min(1).max(8000),
  insertMode: z.enum(["append", "replace_selection", "after_block"]),
  afterBlockId: z.string().min(1).max(160).optional(),
  selectedText: z.string().max(20000).optional()
});
