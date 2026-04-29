import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { pageIdParam } from "../validators/common.validators";
import { aiChatSchema, generatePageSchema, rewriteSchema, summarizePageSchema } from "../validators/ai.validators";
import { vectorizeBlockParamsSchema, vectorizeBlockSchema, vectorizePageSchema, vectorSearchSchema } from "../validators/vector.validators";
import { asyncHandler } from "../utils/async-handler";
import { chatWithAi, generatePageContent, rewriteSelection, streamChatWithAi, summarizePage } from "../services/ai.service";
import { searchEmbeddings, vectorizeBlock, vectorizePage } from "../services/vector.service";

export const aiRouter = Router();

function writeSse(res: import("express").Response, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function extractUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined) {
  return usage ? {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens
  } : undefined;
}

aiRouter.use(authMiddleware);

aiRouter.post("/chat", validate({ body: aiChatSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await chatWithAi(req.user!.uid, req.body) });
}));

aiRouter.post("/chat/stream", validate({ body: aiChatSchema }), asyncHandler(async (req, res) => {
  const upstream = await streamChatWithAi(req.user!.uid, req.body);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const reader = upstream.body?.getReader();
  if (!reader) {
    writeSse(res, "error", { type: "error", message: "AI stream unavailable" });
    res.end();
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };
        const text = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content;
        if (text) writeSse(res, "delta", { type: "delta", text });

        const usage = extractUsage(parsed.usage);
        if (usage) writeSse(res, "usage", { type: "usage", usage });
      } catch {
        writeSse(res, "error", { type: "error", message: "AI stream parse error" });
      }
    }
  }

  writeSse(res, "done", { type: "done" });
  res.end();
}));

aiRouter.post("/pages/:pageId/summarize", validate({ params: pageIdParam, body: summarizePageSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await summarizePage(req.user!.uid, req.params.pageId, req.body) });
}));

aiRouter.post("/pages/:pageId/generate", validate({ params: pageIdParam, body: generatePageSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await generatePageContent(req.user!.uid, req.params.pageId, req.body) });
}));

aiRouter.post("/pages/:pageId/rewrite", validate({ params: pageIdParam, body: rewriteSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await rewriteSelection(req.user!.uid, req.params.pageId, req.body) });
}));

aiRouter.post("/embeddings/search", validate({ body: vectorSearchSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await searchEmbeddings(req.user!.uid, req.body) });
}));

aiRouter.post("/pages/:pageId/vectorize", validate({ params: pageIdParam, body: vectorizePageSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await vectorizePage(req.user!.uid, req.params.pageId, req.body) });
}));

aiRouter.post("/pages/:pageId/blocks/:blockId/vectorize", validate({ params: vectorizeBlockParamsSchema, body: vectorizeBlockSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await vectorizeBlock(req.user!.uid, req.params.pageId, req.params.blockId, req.body?.workspaceId) });
}));
