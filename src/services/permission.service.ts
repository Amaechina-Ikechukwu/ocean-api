import { firestore } from "../config/firebase";

export const workspaceRoles = ["owner", "admin", "editor", "commenter", "viewer"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export async function getWorkspaceRole(workspaceId: string, uid: string): Promise<WorkspaceRole | null> {
  const snapshot = await firestore.doc(`workspaces/${workspaceId}/members/${uid}`).get();
  if (!snapshot.exists) return null;

  const role = snapshot.get("role");
  return workspaceRoles.includes(role) ? role : null;
}

export function canEdit(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

export function canComment(role: WorkspaceRole | null): boolean {
  return canEdit(role) || role === "commenter";
}

export function canView(role: WorkspaceRole | null): boolean {
  return canComment(role) || role === "viewer";
}

export function canManageMembers(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function canDeleteWorkspace(role: WorkspaceRole | null): boolean {
  return role === "owner";
}
