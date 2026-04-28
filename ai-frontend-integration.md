# AI Frontend Integration Guide

This document describes the AI API contract for the Notion-like workspace frontend. It is written so a frontend AI agent can integrate the assistant experience without guessing backend behavior or bypassing workspace security.

## Current Status

The backend AI routes are implemented against NVIDIA NIM chat completions using:

```text
google/gemma-4-31b-it
```

Required backend environment variable:

```env
NVIDIA_API_KEY=
```

Optional backend overrides:

```env
NVIDIA_AI_MODEL=google/gemma-4-31b-it
NVIDIA_AI_BASE_URL=https://integrate.api.nvidia.com/v1/chat/completions
```

Do not expose `NVIDIA_API_KEY` in the frontend. All provider calls must go through the backend.

## Security Model

All AI endpoints must require Firebase Auth.

Frontend requests must send:

```http
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

The backend must verify:

1. The Firebase token is valid and not revoked.
2. The user is a member of the target workspace.
3. The user has permission to read every page/block/database record included in AI context.
4. Any AI action that mutates data requires the same role as the equivalent non-AI endpoint.

The frontend must never send raw Firestore credentials, service account credentials, or unfiltered workspace dumps to an AI provider.

## Recommended Routes

Mount all AI routes under:

```http
/api/ai
```

Implemented endpoints:

```http
POST /api/ai/chat
POST /api/ai/chat/stream
POST /api/ai/pages/:pageId/summarize
POST /api/ai/pages/:pageId/generate
POST /api/ai/pages/:pageId/rewrite
POST /api/ai/pages/:pageId/vectorize
POST /api/ai/pages/:pageId/blocks/:blockId/vectorize
POST /api/ai/embeddings/search
```

Planned endpoint:

```http
POST /api/ai/pages/:pageId/action
```

## Common Types

### AI Message

```ts
type AiMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};
```

The frontend should only send `user` and prior `assistant` messages. Backend-owned system prompts should be created server-side.

### AI Context

```ts
type AiContext = {
  workspaceId: string;
  pageId?: string;
  blockIds?: string[];
  databaseId?: string;
  selectedText?: string;
};
```

The frontend may send IDs and user-selected text. The backend should fetch canonical page, block, and database context after permission checks.

### AI Usage

```ts
type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};
```

## Chat

Use this for a normal workspace assistant conversation.

```http
POST /api/ai/chat
```

Request:

```ts
type AiChatRequest = {
  workspaceId: string;
  pageId?: string;
  messages: AiMessage[];
  selectedText?: string;
  mode?: "ask" | "explain" | "brainstorm" | "draft";
};
```

Response:

```ts
type AiChatResponse = {
  data: {
    message: AiMessage;
    usage?: AiUsage;
  };
};
```

Example:

```ts
await fetch("/api/ai/chat", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    workspaceId,
    pageId,
    mode: "ask",
    messages: [
      { role: "user", content: "Summarize the current project risks." }
    ]
  })
});
```

## Streaming Chat

Use this for the best assistant UX.

```http
POST /api/ai/chat/stream
```

Request shape is the same as `/api/ai/chat`.

The backend returns a Server-Sent Events response:

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

The stream currently forwards NVIDIA stream chunks and appends a final backend `done` event. Frontend code should parse OpenAI-compatible `data:` chunks and also tolerate this backend event:

```ts
type AiStreamEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; usage: AiUsage }
  | { type: "done" }
  | { type: "error"; message: string };
```

SSE payload format:

```text
event: delta
data: {"type":"delta","text":"Hello"}

event: done
data: {"type":"done"}
```

Frontend behavior:

- Append `delta.text` to the assistant message as it arrives.
- Stop loading when `done` arrives.
- Show a recoverable error state when `error` arrives.
- Abort the request with `AbortController` when the user presses stop or navigates away.

## Page Summarization

```http
POST /api/ai/pages/:pageId/summarize
```

Request:

```ts
type SummarizePageRequest = {
  workspaceId: string;
  style?: "brief" | "detailed" | "action_items";
};
```

Response:

```ts
type SummarizePageResponse = {
  data: {
    summary: string;
    actionItems?: string[];
    usage?: AiUsage;
  };
};
```

Permission required: workspace `viewer` or higher.

## Page Generation

Use this when the user asks AI to create new page content.

```http
POST /api/ai/pages/:pageId/generate
```

Request:

```ts
type GeneratePageContentRequest = {
  workspaceId: string;
  prompt: string;
  insertMode: "append" | "replace_selection" | "after_block";
  afterBlockId?: string;
  selectedText?: string;
};
```

Response:

```ts
type GeneratePageContentResponse = {
  data: {
    blocks: Array<{
      type: string;
      content: Record<string, unknown>;
    }>;
    previewText: string;
    usage?: AiUsage;
  };
};
```

Permission required: workspace `editor`, `admin`, or `owner`.

Important: the backend returns generated blocks for preview first. The frontend should ask the user to accept before writing blocks unless the product explicitly enables one-click insertion.

## Rewrite Selection

Use this for inline editor commands like improve writing, shorten, expand, fix grammar, or change tone.

```http
POST /api/ai/pages/:pageId/rewrite
```

Request:

```ts
type RewriteRequest = {
  workspaceId: string;
  selectedText: string;
  instruction:
    | "improve"
    | "shorten"
    | "expand"
    | "fix_grammar"
    | "make_professional"
    | "make_casual"
    | "custom";
  customInstruction?: string;
};
```

Response:

```ts
type RewriteResponse = {
  data: {
    text: string;
    usage?: AiUsage;
  };
};
```

Permission required: workspace `editor`, `admin`, or `owner`.

## AI Actions

Use this for structured operations the assistant can propose or execute, such as creating a page, appending blocks, renaming a page, or creating tasks.

```http
POST /api/ai/pages/:pageId/action
```

Request:

```ts
type AiActionRequest = {
  workspaceId: string;
  prompt: string;
  dryRun?: boolean;
  allowedActions: AiAllowedAction[];
};

type AiAllowedAction =
  | "create_page"
  | "update_page_title"
  | "append_blocks"
  | "replace_blocks"
  | "create_comments";
```

Response:

```ts
type AiActionResponse = {
  data: {
    dryRun: boolean;
    proposedActions: Array<{
      type: AiAllowedAction;
      description: string;
      payload: Record<string, unknown>;
    }>;
    appliedActions?: Array<{
      type: AiAllowedAction;
      resourceId?: string;
    }>;
  };
};
```

Frontend recommendation:

- Default to `dryRun: true`.
- Render proposed actions in a confirmation UI.
- Submit a second request with explicit user confirmation before applying mutations.

## Error Shape

All AI endpoints should use the same backend error shape:

```ts
type ApiErrorResponse = {
  error: {
    message: string;
    details?: unknown;
  };
};
```

Expected statuses:

```http
400 Validation failed
401 Authentication required
403 Insufficient permissions
404 Page or workspace not found
413 Request too large
429 Rate limit exceeded
500 AI provider or server error
```

Frontend should show user-friendly messages and avoid exposing raw provider errors.

## Frontend State Model

Recommended local state:

```ts
type AiPanelState = {
  isOpen: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  messages: AiMessage[];
  error: string | null;
  activeRequestId: string | null;
};
```

Recommended editor integration state:

```ts
type AiEditorState = {
  selectedText: string;
  selectedBlockIds: string[];
  pendingPreview:
    | { type: "text"; text: string }
    | { type: "blocks"; blocks: Array<{ type: string; content: Record<string, unknown> }> }
    | null;
};
```

## UX Integration Points

Recommended frontend entry points:

- Page-level assistant button.
- Inline selection menu for rewrite commands.
- Slash command: `/ai`.
- Empty page prompt: “Ask AI to draft”.
- Block toolbar action: “Ask AI”.

Do not auto-send private page content to AI just because the panel opens. Send context only after the user submits an AI request.

## Privacy Requirements

The frontend should:

- Send the smallest useful context.
- Prefer IDs over full content when the backend can fetch content securely.
- Clearly indicate when selected text will be sent to AI.
- Avoid sending hidden pages, deleted pages, unresolved private comments, or unrelated workspace content.
- Abort in-flight streams when the user closes the panel or changes page.

The backend should:

- Fetch context server-side after permission checks.
- Redact secrets where possible before provider calls.
- Log request metadata, not full prompts or page contents.
- Apply separate rate limits to AI endpoints.
- Store AI conversation history only if the product intentionally supports it.

## Vectorization

The backend uses Gemini embeddings through `@google/genai`.

Required backend environment variable:

```env
GEMINI_API_KEY=
```

Optional backend override:

```env
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
```

Firestore stores vectors in a backend-owned top-level collection:

```ts
type EmbeddingDocument = {
  workspaceId: string;
  pageId: string;
  blockId: string;
  blockType: string;
  text: string;
  embedding: VectorValue;
  embeddingModel: string;
  embeddingDimensions: number;
  updatedAt: Timestamp;
};
```

The document ID is:

```txt
{pageId}_{blockId}
```

Direct client writes to `embeddings/{embeddingId}` are denied by Firestore rules. The frontend should call the backend.

### Vectorize Page

```http
POST /api/ai/pages/:pageId/vectorize
```

Request:

```ts
type VectorizePageRequest = {
  workspaceId: string;
  limit?: number;
};
```

Response:

```ts
type VectorizePageResponse = {
  data: {
    pageId: string;
    indexed: number;
    skipped: number;
    results: Array<
      | { indexed: true; embeddingId: string; dimensions: number }
      | { indexed: false; reason: "empty_text" }
    >;
  };
};
```

Permission required: workspace `editor`, `admin`, or `owner`.

### Vectorize Block

```http
POST /api/ai/pages/:pageId/blocks/:blockId/vectorize
```

Request:

```ts
type VectorizeBlockRequest = {
  workspaceId?: string;
};
```

Response:

```ts
type VectorizeBlockResponse = {
  data:
    | { indexed: true; embeddingId: string; dimensions: number }
    | { indexed: false; reason: "empty_text" };
};
```

Permission required: workspace `editor`, `admin`, or `owner`.

### Vector Search

```http
POST /api/ai/embeddings/search
```

Request:

```ts
type VectorSearchRequest = {
  workspaceId: string;
  query: string;
  limit?: number;
};
```

Response:

```ts
type VectorSearchResponse = {
  data: Array<{
    id: string;
    workspaceId: string;
    pageId: string;
    blockId: string;
    blockType: string;
    text: string;
    distance?: number;
  }>;
};
```

Permission required: workspace `viewer` or higher.

### Frontend Usage

Recommended indexing behavior:

- After a block content update is saved, debounce a call to vectorize that block.
- After importing or creating a full page, call the page vectorization endpoint.
- Do not block the editor UI on vectorization; treat it as background indexing.
- If vectorization returns `503`, keep the app usable and mark AI search as unavailable.

Recommended search behavior:

```ts
const res = await fetch("/api/ai/embeddings/search", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    workspaceId,
    query: "What did we decide about onboarding?",
    limit: 8
  })
});
```

### Firestore Vector Index

Firestore vector search requires a vector index on:

```txt
collection: embeddings
field: embedding
filter field: workspaceId
distance: COSINE
```

Create this during deployment before relying on `/api/ai/embeddings/search`.

## Backend Implementation Notes

Implemented:

1. `src/routes/ai.routes.ts`
2. `src/validators/ai.validators.ts`
3. `src/services/ai.service.ts`
4. NVIDIA/Gemma provider call through backend `fetch`
5. Page/block context loading with workspace permission checks
6. `/api/ai/chat`
7. `/api/ai/chat/stream`
8. Page summarize, generate, and rewrite
9. Gemini embedding generation
10. Firestore vector storage and search endpoints

Still recommended:

1. Add AI-specific rate limits lower than normal API limits.
2. Add audit logs without storing raw prompts by default.
3. Add structured dry-run actions.
4. Convert generated Markdown into real Notion-like blocks.
5. Add provider retries with short timeouts.
6. Add background queue jobs for automatic vectorization.

## Minimum Frontend Mock Contract

Until the backend is implemented, the frontend can code against this interface:

```ts
export async function askAi(input: AiChatRequest): Promise<string> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getFirebaseIdToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.error?.message ?? "AI request failed");
  }

  const json = await res.json() as AiChatResponse;
  return json.data.message.content;
}
```

The frontend should treat `503` as “AI is not configured yet” and keep the UI disabled or show an availability message.
