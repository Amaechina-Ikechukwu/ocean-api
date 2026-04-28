import { FieldValue, firestore } from "../config/firebase";
import type { AuthenticatedUser } from "../types/auth";
import { canEdit, canView, getWorkspaceRole } from "./permission.service";
import { forbidden, notFound } from "../utils/http-error";

async function getPageForEdit(pageId: string, uid: string) {
  const page = await firestore.doc(`pages/${pageId}`).get();
  if (!page.exists || page.get("isDeleted")) throw notFound("Page not found");
  const role = await getWorkspaceRole(page.get("workspaceId"), uid);
  if (!canEdit(role)) throw forbidden();
  return page;
}

async function getPageForView(pageId: string, uid: string) {
  const page = await firestore.doc(`pages/${pageId}`).get();
  if (!page.exists || page.get("isDeleted")) throw notFound("Page not found");
  const role = await getWorkspaceRole(page.get("workspaceId"), uid);
  if (!canView(role)) throw forbidden();
  return page;
}

export async function listBlocks(pageId: string, uid: string) {
  await getPageForView(pageId, uid);
  const snapshot = await firestore.collection(`pages/${pageId}/blocks`)
    .where("isDeleted", "==", false)
    .orderBy("order", "asc")
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function createBlock(user: AuthenticatedUser, pageId: string, input: { type: string; content: Record<string, unknown>; parentBlockId?: string | null; order?: number }) {
  const page = await getPageForEdit(pageId, user.uid);
  const ref = firestore.collection(`pages/${pageId}/blocks`).doc();
  const now = FieldValue.serverTimestamp();
  const block = {
    pageId,
    workspaceId: page.get("workspaceId"),
    type: input.type,
    content: input.content,
    parentBlockId: input.parentBlockId ?? null,
    order: input.order ?? 1000,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: now,
    updatedAt: now,
    isDeleted: false
  };
  await ref.set(block);
  return { id: ref.id, ...block };
}

export async function updateBlock(user: AuthenticatedUser, pageId: string, blockId: string, data: Record<string, unknown>) {
  await getPageForEdit(pageId, user.uid);
  const ref = firestore.doc(`pages/${pageId}/blocks/${blockId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("isDeleted")) throw notFound("Block not found");
  await ref.update({
    ...data,
    updatedBy: user.uid,
    updatedAt: FieldValue.serverTimestamp()
  });
  const updated = await ref.get();
  return { id: updated.id, ...updated.data() };
}

export async function deleteBlock(user: AuthenticatedUser, pageId: string, blockId: string) {
  await getPageForEdit(pageId, user.uid);
  const ref = firestore.doc(`pages/${pageId}/blocks/${blockId}`);
  await ref.update({
    isDeleted: true,
    updatedBy: user.uid,
    updatedAt: FieldValue.serverTimestamp()
  });
}

export async function reorderBlocks(user: AuthenticatedUser, pageId: string, blocks: Array<{ blockId: string; order: number }>) {
  await getPageForEdit(pageId, user.uid);
  const batch = firestore.batch();
  for (const block of blocks) {
    batch.update(firestore.doc(`pages/${pageId}/blocks/${block.blockId}`), {
      order: block.order,
      updatedBy: user.uid,
      updatedAt: FieldValue.serverTimestamp()
    });
  }
  await batch.commit();
}

export async function bulkBlocks(user: AuthenticatedUser, pageId: string, input: {
  create?: Array<{ type: string; content: Record<string, unknown>; parentBlockId?: string | null; order?: number }>;
  update?: Array<{ blockId: string; data: Record<string, unknown> }>;
  delete?: string[];
}) {
  const page = await getPageForEdit(pageId, user.uid);
  const batch = firestore.batch();
  const now = FieldValue.serverTimestamp();
  const created: string[] = [];

  for (const data of input.create ?? []) {
    const ref = firestore.collection(`pages/${pageId}/blocks`).doc();
    created.push(ref.id);
    batch.set(ref, {
      pageId,
      workspaceId: page.get("workspaceId"),
      type: data.type,
      content: data.content,
      parentBlockId: data.parentBlockId ?? null,
      order: data.order ?? 1000,
      createdBy: user.uid,
      updatedBy: user.uid,
      createdAt: now,
      updatedAt: now,
      isDeleted: false
    });
  }

  for (const item of input.update ?? []) {
    batch.update(firestore.doc(`pages/${pageId}/blocks/${item.blockId}`), {
      ...item.data,
      updatedBy: user.uid,
      updatedAt: now
    });
  }

  for (const blockId of input.delete ?? []) {
    batch.update(firestore.doc(`pages/${pageId}/blocks/${blockId}`), {
      isDeleted: true,
      updatedBy: user.uid,
      updatedAt: now
    });
  }

  await batch.commit();
  return { created };
}
