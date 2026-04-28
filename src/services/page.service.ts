import { FieldValue, firestore } from "../config/firebase";
import type { AuthenticatedUser } from "../types/auth";
import { canEdit, canView, getWorkspaceRole } from "./permission.service";
import { forbidden, notFound } from "../utils/http-error";

type PageRecord = {
  workspaceId: string;
  parentPageId: string | null;
  title: string;
  icon: string;
  coverImage: string | null;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
  visibility: "private" | "workspace" | "public";
  order: number;
  [key: string]: unknown;
};

async function assertWorkspaceView(workspaceId: string, uid: string) {
  const role = await getWorkspaceRole(workspaceId, uid);
  if (!canView(role)) throw forbidden();
}

async function assertWorkspaceEdit(workspaceId: string, uid: string) {
  const role = await getWorkspaceRole(workspaceId, uid);
  if (!canEdit(role)) throw forbidden();
}

export async function getPageForUser(pageId: string, uid: string) {
  const snapshot = await firestore.doc(`pages/${pageId}`).get();
  if (!snapshot.exists || snapshot.get("isDeleted")) throw notFound("Page not found");

  const page = snapshot.data()! as PageRecord;
  await assertWorkspaceView(page.workspaceId, uid);
  return { id: snapshot.id, ...page };
}

export async function createPage(user: AuthenticatedUser, input: {
  workspaceId: string;
  parentPageId?: string | null;
  title: string;
  icon: string;
  coverImage?: string | null;
  visibility: "private" | "workspace" | "public";
  order?: number;
}) {
  await assertWorkspaceEdit(input.workspaceId, user.uid);

  if (input.parentPageId) {
    const parent = await firestore.doc(`pages/${input.parentPageId}`).get();
    if (!parent.exists || parent.get("workspaceId") !== input.workspaceId || parent.get("isDeleted")) {
      throw notFound("Parent page not found");
    }
  }

  const pageRef = firestore.collection("pages").doc();
  const blockRef = pageRef.collection("blocks").doc();
  const now = FieldValue.serverTimestamp();
  const page = {
    workspaceId: input.workspaceId,
    parentPageId: input.parentPageId ?? null,
    title: input.title,
    icon: input.icon,
    coverImage: input.coverImage ?? null,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    deletedAt: null,
    visibility: input.visibility,
    order: input.order ?? 1000
  };

  const batch = firestore.batch();
  batch.set(pageRef, page);
  batch.set(blockRef, {
    pageId: pageRef.id,
    workspaceId: input.workspaceId,
    type: "paragraph",
    content: { text: "" },
    parentBlockId: null,
    order: 1000,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: now,
    updatedAt: now,
    isDeleted: false
  });
  batch.set(firestore.collection(`workspaces/${input.workspaceId}/activityLogs`).doc(), {
    type: "page_created",
    actorId: user.uid,
    pageId: pageRef.id,
    message: `Page created: ${input.title}`,
    createdAt: now
  });
  await batch.commit();

  return { id: pageRef.id, ...page };
}

export async function updatePage(pageId: string, uid: string, data: Record<string, unknown>) {
  const existing = await getPageForUser(pageId, uid);
  await assertWorkspaceEdit(String(existing.workspaceId), uid);
  await firestore.doc(`pages/${pageId}`).update({
    ...data,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp()
  });
  return getPageForUser(pageId, uid);
}

export async function softDeletePage(pageId: string, uid: string) {
  const existing = await getPageForUser(pageId, uid);
  await assertWorkspaceEdit(String(existing.workspaceId), uid);
  await firestore.doc(`pages/${pageId}`).update({
    isDeleted: true,
    deletedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp()
  });
}

export async function restorePage(pageId: string, uid: string) {
  const snapshot = await firestore.doc(`pages/${pageId}`).get();
  if (!snapshot.exists) throw notFound("Page not found");
  await assertWorkspaceEdit(snapshot.get("workspaceId"), uid);
  await snapshot.ref.update({
    isDeleted: false,
    deletedAt: null,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp()
  });
}

export async function listRootPages(workspaceId: string, uid: string) {
  await assertWorkspaceView(workspaceId, uid);
  const snapshot = await firestore.collection("pages")
    .where("workspaceId", "==", workspaceId)
    .where("parentPageId", "==", null)
    .where("isDeleted", "==", false)
    .orderBy("order", "asc")
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function listChildPages(pageId: string, uid: string) {
  const page = await getPageForUser(pageId, uid);
  const snapshot = await firestore.collection("pages")
    .where("workspaceId", "==", page.workspaceId)
    .where("parentPageId", "==", pageId)
    .where("isDeleted", "==", false)
    .orderBy("order", "asc")
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function movePage(pageId: string, uid: string, input: { parentPageId: string | null; order?: number }) {
  const page = await getPageForUser(pageId, uid);
  await assertWorkspaceEdit(String(page.workspaceId), uid);
  if (input.parentPageId) {
    const parent = await getPageForUser(input.parentPageId, uid);
    if (parent.workspaceId !== page.workspaceId) throw forbidden("Cannot move page across workspaces");
  }

  await firestore.doc(`pages/${pageId}`).update({
    parentPageId: input.parentPageId,
    ...(input.order === undefined ? {} : { order: input.order }),
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp()
  });
  return getPageForUser(pageId, uid);
}
