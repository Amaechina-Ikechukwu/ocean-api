import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export function logViewerAuth(req: Request, res: Response, next: NextFunction) {
  if (!env.LOG_VIEWER_TOKEN) {
    res.status(404).send("Not found");
    return;
  }

  const token = req.header("x-log-viewer-token") ?? (typeof req.query.token === "string" ? req.query.token : undefined);
  if (token !== env.LOG_VIEWER_TOKEN) {
    res.status(401).send("Unauthorized");
    return;
  }

  next();
}
