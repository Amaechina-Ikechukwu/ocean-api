import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, firestore } from "../config/firebase";
import type { AuthenticatedUser } from "../types/auth";
import { canDeleteWorkspace, getWorkspaceRole, type WorkspaceRole } from "./permission.service";
import { forbidden, notFound } from "../utils/http-error";

export async function createWorkspace(user: AuthenticatedUser, input: { name: string; icon: string; coverImage?: string | null }) {
  const workspaceRef = firestore.collection("workspaces").doc();
  const pageRef = firestore.collection("pages").doc();
  const memberRef = workspaceRef.collection("members").doc(user.uid);
  const userWorkspaceRef = firestore.doc(`users/${user.uid}/workspaces/${workspaceRef.id}`);
  const now = FieldValue.serverTimestamp();

  const workspace = {
    name: input.name,
    icon: input.icon,
    coverImage: input.coverImage ?? null,
    ownerId: user.uid,
    createdAt: now,
    updatedAt: now,
    isDeleted: false
  };

  const member = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    role: "owner" satisfies WorkspaceRole,
    status: "active",
    joinedAt: now
  };

  const homePage = {
    workspaceId: workspaceRef.id,
    parentPageId: null,
    title: "Home",
    icon: "home",
    coverImage: null,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    deletedAt: null,
    visibility: "workspace",
    order: 1000
  };

  const batch = firestore.batch();
  batch.set(workspaceRef, workspace);
  batch.set(memberRef, member);
  batch.set(userWorkspaceRef, {
    workspaceId: workspaceRef.id,
    name: input.name,
    icon: input.icon,
    role: "owner",
    joinedAt: now
  });
  batch.set(pageRef, homePage);
  batch.set(workspaceRef.collection("activityLogs").doc(), {
    type: "member_added",
    actorId: user.uid,
    message: "Workspace created",
    createdAt: now
  });
  await batch.commit();

  return {
    workspace: { id: workspaceRef.id, ...workspace },
    page: { id: pageRef.id, ...homePage }
  };
}

export async function listWorkspaces(uid: string) {
  const snapshot = await firestore.collection(`users/${uid}/workspaces`).orderBy("joinedAt", "desc").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function getWorkspace(workspaceId: string) {
  const snapshot = await firestore.doc(`workspaces/${workspaceId}`).get();
  if (!snapshot.exists || snapshot.get("isDeleted")) throw notFound("Workspace not found");
  return { id: snapshot.id, ...snapshot.data() };
}

export async function updateWorkspace(workspaceId: string, data: { name?: string; icon?: string; coverImage?: string | null }) {
  const update = { ...data, updatedAt: FieldValue.serverTimestamp() };
  await firestore.doc(`workspaces/${workspaceId}`).update(update);
  return getWorkspace(workspaceId);
}

export async function deleteWorkspace(workspaceId: string, uid: string) {
  const role = await getWorkspaceRole(workspaceId, uid);
  if (!canDeleteWorkspace(role)) throw forbidden("Only the workspace owner can delete the workspace");

  await firestore.doc(`workspaces/${workspaceId}`).update({
    isDeleted: true,
    updatedAt: FieldValue.serverTimestamp()
  });
}

export async function listMembers(workspaceId: string) {
  const snapshot = await firestore.collection(`workspaces/${workspaceId}/members`).orderBy("joinedAt", "asc").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function updateMemberRole(workspaceId: string, uid: string, role: Exclude<WorkspaceRole, "owner">) {
  const memberRef = firestore.doc(`workspaces/${workspaceId}/members/${uid}`);
  const snapshot = await memberRef.get();
  if (!snapshot.exists) throw notFound("Member not found");
  if (snapshot.get("role") === "owner") throw forbidden("Owner role cannot be changed");

  await memberRef.update({ role });
  await firestore.doc(`users/${uid}/workspaces/${workspaceId}`).set({ role }, { merge: true });
}

export async function removeMember(workspaceId: string, uid: string) {
  const memberRef = firestore.doc(`workspaces/${workspaceId}/members/${uid}`);
  const snapshot = await memberRef.get();
  if (!snapshot.exists) throw notFound("Member not found");
  if (snapshot.get("role") === "owner") throw forbidden("Owner cannot be removed");

  const batch = firestore.batch();
  batch.delete(memberRef);
  batch.delete(firestore.doc(`users/${uid}/workspaces/${workspaceId}`));
  await batch.commit();
}

export async function createInvite(workspaceId: string, actorId: string, input: { email: string; role: Exclude<WorkspaceRole, "owner"> }) {
  const inviteRef = firestore.collection("invites").doc(randomUUID());
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + 1000 * 60 * 60 * 24 * 7);

  const invite = {
    workspaceId,
    email: input.email,
    role: input.role,
    status: "pending",
    invitedBy: actorId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt
  };

  await inviteRef.set(invite);
  return { id: inviteRef.id, ...invite };
}
