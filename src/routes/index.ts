import { Router } from "express";
import { meRouter } from "./me.routes";
import { workspaceRouter } from "./workspace.routes";
import { pageRouter, workspacePagesRouter } from "./page.routes";
import { blockRouter } from "./block.routes";
import { aiRouter } from "./ai.routes";

const router = Router();

router.use("/me", meRouter);
router.use("/workspaces", workspacePagesRouter);
router.use("/workspaces", workspaceRouter);
router.use("/pages", blockRouter);
router.use("/pages", pageRouter);
router.use("/ai", aiRouter);

router.use("/databases", (_req, res) => res.status(501).json({ error: { message: "Databases API is not implemented yet" } }));
router.use("/comments", (_req, res) => res.status(501).json({ error: { message: "Comments API is not implemented yet" } }));
router.use("/files", (_req, res) => res.status(501).json({ error: { message: "Files API is not implemented yet" } }));
router.use("/search", (_req, res) => res.status(501).json({ error: { message: "Search API is not implemented yet" } }));

export default router;
