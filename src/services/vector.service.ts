import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { FieldValue, firestore } from "../config/firebase";
import { canEdit, canView, getWorkspaceRole } from "./permission.service";
import { forbidden, HttpError, notFound } from "../utils/http-error";

type SearchResult = {
  id: string;
  workspaceId: string;
  pageId: string;
  blockId: string;
  text: string;
  blockType: string;
  distance?: number;
};

function assertGeminiConfigured() {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, "Gemini embeddings are not configured");
  }
}

function getGeminiClient() {
  assertGeminiConfigured();
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

async function assertWorkspaceView(workspaceId: string, uid: string) {
  const role = await getWorkspaceRole(workspaceId, uid);
  if (!canView(role)) throw forbidden();
}

async function assertWorkspaceEdit(workspaceId: string, uid: string) {
  const role = await getWorkspaceRole(workspaceId, uid);
  if (!canEdit(role)) throw forbidden();
}

function stringifyBlockContent(content: unknown): string {
  if (!content || typeof content !== "object") return "";

  const record = content as Record<string, unknown>;
  const preferred = ["text", "title", "caption", "url", "language", "checked"];
  const pieces = preferred
    .map((key) => record[key])
    .filter((value) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    .map(String);

  if (pieces.length > 0) return pieces.join(" ");
  return JSON.stringify(record);
}

function normalizeEmbedding(response: Awaited<ReturnType<GoogleGenAI["models"]["embedContent"]>>): number[] {
  const values = response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new HttpError(502, "Gemini returned an empty embedding");
  }

  if (values.length > 2048) {
    throw new HttpError(502, `Gemini returned ${values.length} embedding dimensions; Firestore supports at most 2048`);
  }

  return values;
}

export async function createEmbedding(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) throw new HttpError(400, "Cannot embed empty text");

  const response = await getGeminiClient().models.embedContent({
    model: env.GEMINI_EMBEDDING_MODEL,
    contents: trimmed,
    config: {
      outputDimensionality: env.GEMINI_EMBEDDING_DIMENSIONS
    }
  });

  return normalizeEmbedding(response);
}

async function getPageForWorkspace(pageId: string, workspaceId: string) {
  const page = await firestore.doc(`pages/${pageId}`).get();
  if (!page.exists || page.get("isDeleted")) throw notFound("Page not found");
  if (page.get("workspaceId") !== workspaceId) throw forbidden("Page does not belong to workspace");
  return page;
}

export async function vectorizeBlock(uid: string, pageId: string, blockId: string, workspaceId?: string) {
  const page = await firestore.doc(`pages/${pageId}`).get();
  if (!page.exists || page.get("isDeleted")) throw notFound("Page not found");

  const resolvedWorkspaceId = workspaceId ?? String(page.get("workspaceId"));
  if (page.get("workspaceId") !== resolvedWorkspaceId) throw forbidden("Page does not belong to workspace");
  await assertWorkspaceEdit(resolvedWorkspaceId, uid);

  const block = await firestore.doc(`pages/${pageId}/blocks/${blockId}`).get();
  if (!block.exists || block.get("isDeleted")) throw notFound("Block not found");

  const blockType = String(block.get("type") ?? "paragraph");
  const text = stringifyBlockContent(block.get("content")).slice(0, 12000);
  if (!text.trim()) {
    await firestore.doc(`embeddings/${pageId}_${blockId}`).delete();
    return { indexed: false, reason: "empty_text" };
  }

  const embedding = await createEmbedding(text);
  const ref = firestore.doc(`embeddings/${pageId}_${blockId}`);
  await ref.set({
    workspaceId: resolvedWorkspaceId,
    pageId,
    blockId,
    blockType,
    text,
    embedding: (FieldValue as unknown as { vector(values: number[]): unknown }).vector(embedding),
    embeddingModel: env.GEMINI_EMBEDDING_MODEL,
    embeddingDimensions: embedding.length,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { indexed: true, embeddingId: ref.id, dimensions: embedding.length };
}

export async function vectorizePage(uid: string, pageId: string, input: { workspaceId: string; limit: number }) {
  await getPageForWorkspace(pageId, input.workspaceId);
  await assertWorkspaceEdit(input.workspaceId, uid);

  const blocks = await firestore.collection(`pages/${pageId}/blocks`)
    .where("isDeleted", "==", false)
    .orderBy("order", "asc")
    .limit(input.limit)
    .get();

  const results = [];
  for (const block of blocks.docs) {
    results.push(await vectorizeBlock(uid, pageId, block.id, input.workspaceId));
  }

  return {
    pageId,
    indexed: results.filter((result) => result.indexed).length,
    skipped: results.filter((result) => !result.indexed).length,
    results
  };
}

export async function searchEmbeddings(uid: string, input: { workspaceId: string; query: string; limit: number }): Promise<SearchResult[]> {
  await assertWorkspaceView(input.workspaceId, uid);
  const queryVector = await createEmbedding(input.query);

  const collection = firestore.collection("embeddings") as unknown as {
    where(field: string, op: "==", value: string): {
      findNearest(options: {
        vectorField: string;
        queryVector: number[];
        limit: number;
        distanceMeasure: "COSINE";
        distanceResultField: string;
      }): { get(): Promise<FirebaseFirestore.QuerySnapshot> };
    };
  };

  const snapshot = await collection
    .where("workspaceId", "==", input.workspaceId)
    .findNearest({
      vectorField: "embedding",
      queryVector,
      limit: input.limit,
      distanceMeasure: "COSINE",
      distanceResultField: "distance"
    })
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      workspaceId: String(data.workspaceId),
      pageId: String(data.pageId),
      blockId: String(data.blockId),
      text: String(data.text ?? ""),
      blockType: String(data.blockType ?? "paragraph"),
      distance: typeof data.distance === "number" ? data.distance : undefined
    };
  });
}
