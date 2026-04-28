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

aiRouter.use(authMiddleware);

aiRouter.post("/chat", validate({ body: aiChatSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await chatWithAi(req.user!.uid, req.body) });
}));

aiRouter.post("/chat/stream", validate({ body: aiChatSchema }), asyncHandler(async (req, res) => {
  const upstream = await streamChatWithAi(req.user!.uid, req.body);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  const reader = upstream.body?.getReader();
  if (!reader) {
    res.write("event: error\ndata: {\"type\":\"error\",\"message\":\"AI stream unavailable\"}\n\n");
    res.end();
    return;
  }

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(decoder.decode(value, { stream: true }));
  }

  res.write("event: done\ndata: {\"type\":\"done\"}\n\n");
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
