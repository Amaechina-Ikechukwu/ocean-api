import type { NextFunction, Request, Response } from "express";
import { canComment, canEdit, canManageMembers, canView, getWorkspaceRole, type WorkspaceRole } from "../services/permission.service";
import { forbidden, unauthorized } from "../utils/http-error";

type Permission = "view" | "comment" | "edit" | "manageMembers";

const checks: Record<Permission, (role: WorkspaceRole | null) => boolean> = {
  view: canView,
  comment: canComment,
  edit: canEdit,
  manageMembers: canManageMembers
};

export function requireWorkspacePermission(source: "params" | "body", key = "workspaceId", permission: Permission = "view") {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw unauthorized();

      const container = source === "params" ? req.params : req.body;
      const workspaceId = container[key];
      if (typeof workspaceId !== "string") throw forbidden("Workspace is required");

      const role = await getWorkspaceRole(workspaceId, req.user.uid);
      if (!checks[permission](role)) throw forbidden();

      next();
    } catch (error) {
      next(error);
    }
  };
}
