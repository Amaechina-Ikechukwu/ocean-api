import "express-serve-static-core";
import type { AuthenticatedUser } from "./auth";
import type { RequestLogContext } from "./request";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
    requestId?: string;
    logContext?: RequestLogContext;
  }
}
