import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireWorkspacePermission } from "../middleware/permission.middleware";
import { validate } from "../middleware/validate.middleware";
import { idParam } from "../validators/common.validators";
import { createInviteSchema, createWorkspaceSchema, memberUidParam, updateMemberRoleSchema, updateWorkspaceSchema } from "../validators/workspace.validators";
import { asyncHandler } from "../utils/async-handler";
import { createInvite, createWorkspace, deleteWorkspace, getWorkspace, listMembers, listWorkspaces, removeMember, updateMemberRole, updateWorkspace } from "../services/workspace.service";

export const workspaceRouter = Router();

workspaceRouter.use(authMiddleware);

workspaceRouter.post("/", validate({ body: createWorkspaceSchema }), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await createWorkspace(req.user!, req.body) });
}));

workspaceRouter.get("/", asyncHandler(async (req, res) => {
  res.json({ data: await listWorkspaces(req.user!.uid) });
}));

workspaceRouter.get("/:workspaceId", validate({ params: idParam }), requireWorkspacePermission("params"), asyncHandler(async (req, res) => {
  res.json({ data: await getWorkspace(req.params.workspaceId) });
}));

workspaceRouter.patch("/:workspaceId", validate({ params: idParam, body: updateWorkspaceSchema }), requireWorkspacePermission("params", "workspaceId", "manageMembers"), asyncHandler(async (req, res) => {
  res.json({ data: await updateWorkspace(req.params.workspaceId, req.body) });
}));

workspaceRouter.delete("/:workspaceId", validate({ params: idParam }), asyncHandler(async (req, res) => {
  await deleteWorkspace(req.params.workspaceId, req.user!.uid);
  res.status(204).send();
}));

workspaceRouter.get("/:workspaceId/members", validate({ params: idParam }), requireWorkspacePermission("params"), asyncHandler(async (req, res) => {
  res.json({ data: await listMembers(req.params.workspaceId) });
}));

workspaceRouter.post("/:workspaceId/invites", validate({ params: idParam, body: createInviteSchema }), requireWorkspacePermission("params", "workspaceId", "manageMembers"), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await createInvite(req.params.workspaceId, req.user!.uid, req.body) });
}));

workspaceRouter.patch("/:workspaceId/members/:uid/role", validate({ params: memberUidParam, body: updateMemberRoleSchema }), requireWorkspacePermission("params", "workspaceId", "manageMembers"), asyncHandler(async (req, res) => {
  await updateMemberRole(req.params.workspaceId, req.params.uid, req.body.role);
  res.status(204).send();
}));

workspaceRouter.delete("/:workspaceId/members/:uid", validate({ params: memberUidParam }), requireWorkspacePermission("params", "workspaceId", "manageMembers"), asyncHandler(async (req, res) => {
  await removeMember(req.params.workspaceId, req.params.uid);
  res.status(204).send();
}));
