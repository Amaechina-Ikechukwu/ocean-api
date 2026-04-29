import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { isProduction } from "../config/env";
import { logger } from "../services/logger.service";
import { HttpError } from "../utils/http-error";

export const errorMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  logger.error("request failed", {
    meta: {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      uid: req.user?.uid,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: isProduction ? undefined : error.stack
      } : error
    }
  });

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        message: "Validation failed",
        details: error.flatten()
      }
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  res.status(500).json({
    error: {
      message: "Internal server error",
      details: isProduction ? undefined : error instanceof Error ? error.message : error
    }
  });
};
