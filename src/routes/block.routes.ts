import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { blockIdParam, pageIdParam } from "../validators/common.validators";
import { bulkBlocksSchema, createBlockSchema, reorderBlocksSchema, updateBlockSchema } from "../validators/block.validators";
import { asyncHandler } from "../utils/async-handler";
import { bulkBlocks, createBlock, deleteBlock, listBlocks, reorderBlocks, updateBlock } from "../services/block.service";

export const blockRouter = Router();

blockRouter.use(authMiddleware);

blockRouter.get("/:pageId/blocks", validate({ params: pageIdParam }), asyncHandler(async (req, res) => {
  res.json({ data: await listBlocks(req.params.pageId, req.user!.uid) });
}));

blockRouter.post("/:pageId/blocks", validate({ params: pageIdParam, body: createBlockSchema }), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await createBlock(req.user!, req.params.pageId, req.body) });
}));

blockRouter.patch("/:pageId/blocks/:blockId", validate({ params: blockIdParam, body: updateBlockSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await updateBlock(req.user!, req.params.pageId, req.params.blockId, req.body) });
}));

blockRouter.delete("/:pageId/blocks/:blockId", validate({ params: blockIdParam }), asyncHandler(async (req, res) => {
  await deleteBlock(req.user!, req.params.pageId, req.params.blockId);
  res.status(204).send();
}));

blockRouter.post("/:pageId/blocks/reorder", validate({ params: pageIdParam, body: reorderBlocksSchema }), asyncHandler(async (req, res) => {
  await reorderBlocks(req.user!, req.params.pageId, req.body.blocks);
  res.status(204).send();
}));

blockRouter.post("/:pageId/blocks/bulk", validate({ params: pageIdParam, body: bulkBlocksSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await bulkBlocks(req.user!, req.params.pageId, req.body) });
}));
