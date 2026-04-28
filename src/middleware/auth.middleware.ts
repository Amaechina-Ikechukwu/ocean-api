import type { NextFunction, Request, Response } from "express";
import { auth } from "../config/firebase";
import { unauthorized } from "../utils/http-error";

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("Authorization");
    const [scheme, token] = header?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token) {
      throw unauthorized("Missing Bearer token");
    }

    const decoded = await auth.verifyIdToken(token, true);
    req.user = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      photoURL: decoded.picture ?? null
    };

    next();
  } catch (error) {
    if (error instanceof Error && error.name === "HttpError") {
      next(error);
      return;
    }

    next(unauthorized("Invalid or expired token"));
  }
}
