import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../services/logger.service";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  req.requestId = randomUUID();
  req.logContext = { requestId: req.requestId };
  res.setHeader("x-request-id", req.requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger.log(level, "request completed", {
      meta: {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        uid: req.user?.uid,
        ip: req.ip
      }
    });
  });

  next();
}
