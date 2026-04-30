import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { idParam, pageIdParam } from "../validators/common.validators";
import { createPageSchema, createWorkspacePageSchema, movePageSchema, updatePageSchema } from "../validators/page.validators";
import { asyncHandler } from "../utils/async-handler";
import { createPage, getPageContent, getPageForUser, getPageTree, listChildPages, listRootPages, listWorkspacePages, movePage, restorePage, softDeletePage, updatePage } from "../services/page.service";

export const pageRouter = Router();

pageRouter.use(authMiddleware);

pageRouter.post("/", validate({ body: createPageSchema }), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await createPage(req.user!, req.body) });
}));

pageRouter.get("/:pageId", validate({ params: pageIdParam }), asyncHandler(async (req, res) => {
  res.json({ data: await getPageForUser(req.params.pageId, req.user!.uid) });
}));

pageRouter.get("/:pageId/content", validate({ params: pageIdParam }), asyncHandler(async (req, res) => {
  res.json({ data: await getPageContent(req.params.pageId, req.user!.uid) });
}));

pageRouter.patch("/:pageId", validate({ params: pageIdParam, body: updatePageSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await updatePage(req.params.pageId, req.user!.uid, req.body) });
}));

pageRouter.put("/:pageId", validate({ params: pageIdParam, body: updatePageSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await updatePage(req.params.pageId, req.user!.uid, req.body) });
}));

pageRouter.delete("/:pageId", validate({ params: pageIdParam }), asyncHandler(async (req, res) => {
  await softDeletePage(req.params.pageId, req.user!.uid);
  res.status(204).send();
}));

pageRouter.post("/:pageId/restore", validate({ params: pageIdParam }), asyncHandler(async (req, res) => {
  await restorePage(req.params.pageId, req.user!.uid);
  res.status(204).send();
}));

pageRouter.post("/:pageId/move", validate({ params: pageIdParam, body: movePageSchema }), asyncHandler(async (req, res) => {
  res.json({ data: await movePage(req.params.pageId, req.user!.uid, req.body) });
}));

pageRouter.get("/:pageId/children", validate({ params: pageIdParam }), asyncHandler(async (req, res) => {
  res.json({ data: await listChildPages(req.params.pageId, req.user!.uid) });
}));

export const workspacePagesRouter = Router();

workspacePagesRouter.use(authMiddleware);

workspacePagesRouter.post("/:workspaceId/pages", validate({ params: idParam, body: createWorkspacePageSchema }), asyncHandler(async (req, res) => {
  const body = { ...req.body, workspaceId: req.params.workspaceId };
  res.status(201).json({ data: await createPage(req.user!, body) });
}));

workspacePagesRouter.get("/:workspaceId/pages/tree", validate({ params: idParam }), asyncHandler(async (req, res) => {
  res.json({ data: await getPageTree(req.params.workspaceId, req.user!.uid) });
}));

workspacePagesRouter.get("/:workspaceId/pages/root", validate({ params: idParam }), asyncHandler(async (req, res) => {
  res.json({ data: await listRootPages(req.params.workspaceId, req.user!.uid) });
}));

workspacePagesRouter.get("/:workspaceId/pages", validate({ params: idParam }), asyncHandler(async (req, res) => {
  res.json({ data: await listWorkspacePages(req.params.workspaceId, req.user!.uid) });
}));
