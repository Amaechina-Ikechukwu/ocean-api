# Ocean API AI Frontend Integration

This is the canonical frontend contract for the AI endpoints. Use this file as the source of truth.

## Base URL

Do not put `/api` in both the base URL and the route path.

Use one of these patterns:

```ts
const API_ORIGIN = "https://ocean-api-269299350620.europe-west1.run.app";
await apiFetch("/api/ai/chat", options);
```

or:

```ts
const API_BASE = "https://ocean-api-269299350620.europe-west1.run.app/api";
await apiFetch("/ai/chat", options);
```

Recommended helper:

```ts
export function joinApiUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
```

Bad:

```txt
https://...run.app/api + /api/ai/chat = /api/api/ai/chat
```

The backend currently accepts `/api/api/...` as a temporary compatibility fallback, but the frontend should not rely on it.

## Auth

Every AI request requires a Firebase ID token:

```http
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

The backend verifies the token with Firebase Admin, then checks Firestore workspace membership and role permissions.

## Error Shape

All handled API errors return JSON:

```ts
type ApiErrorResponse = {
  error: {
    message: string;
    details?: unknown;
  };
};
```

Frontend error helper:

```ts
async function readApiError(res: Response) {
  const json = await res.json().catch(() => null);
  return json?.error?.message ?? `Request failed with ${res.status}`;
}
```

Common statuses:

```txt
400 validation failed
401 missing or invalid Firebase token
403 user is not allowed to access the workspace/page
404 route, workspace, page, or block not found
429 rate limited
502 AI provider failed
503 AI or embeddings provider is not configured
```

## Shared Types

The frontend may send only `user` and previous `assistant` messages. Do not send `system`; the backend creates system prompts.

```ts
type AiMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};
```

## Client Helper

```ts
type ApiClientOptions = {
  baseUrl: string;
  getIdToken: () => Promise<string>;
};

export function createOceanApiClient({ baseUrl, getIdToken }: ApiClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getIdToken();
    const res = await fetch(joinApiUrl(baseUrl, path), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers
      }
    });

    if (!res.ok) throw new Error(await readApiError(res));
    return await res.json() as T;
  }

  return { request };
}
```

Use it like this:

```ts
const api = createOceanApiClient({
  baseUrl: "https://ocean-api-269299350620.europe-west1.run.app",
  getIdToken: () => firebaseAuth.currentUser!.getIdToken()
});
```

## Chat

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
    message: {
      role: "assistant";
      content: string;
    };
    usage?: AiUsage;
  };
};
```

Example:

```ts
const result = await api.request<AiChatResponse>("/api/ai/chat", {
  method: "POST",
  body: JSON.stringify({
    workspaceId,
    pageId,
    mode: "ask",
    messages: [{ role: "user", content: "Summarize this page." }]
  })
});
```

Permission: workspace `viewer` or higher.

## Streaming Chat

```http
POST /api/ai/chat/stream
```

Request: same body as `POST /api/ai/chat`.

Response is Server-Sent Events. The backend normalizes provider chunks into these events:

```ts
type AiStreamEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; usage: AiUsage }
  | { type: "done" }
  | { type: "error"; message: string };
```

Fetch streaming helper:

```ts
export async function streamAiChat(
  baseUrl: string,
  token: string,
  body: AiChatRequest,
  onEvent: (event: AiStreamEvent) => void,
  signal?: AbortSignal
) {
  const res = await fetch(joinApiUrl(baseUrl, "/api/ai/chat/stream"), {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(await readApiError(res));
  if (!res.body) throw new Error("Streaming is not supported in this browser");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      onEvent(JSON.parse(dataLine.slice(5).trim()) as AiStreamEvent);
    }
  }
}
```

Frontend behavior:

- Append every `delta.text` to the current assistant message.
- Stop loading on `done`.
- Use `AbortController` for a stop button and page navigation.
- Show `error.message` if an `error` event arrives.

Permission: workspace `viewer` or higher.

## Summarize Page

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
    usage?: AiUsage;
  };
};
```

Permission: workspace `viewer` or higher.

## Generate Page Content

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
    previewText: string;
    blocks: Array<{
      type: string;
      content: Record<string, unknown>;
    }>;
    usage?: AiUsage;
  };
};
```

The backend returns generated content for preview. The frontend should only write blocks after the user confirms.

Permission: workspace `editor`, `admin`, or `owner`.

## Rewrite Selection

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

Permission: workspace `editor`, `admin`, or `owner`.

## Vectorize Block

Use this after a block content update. Debounce it; do not block editing on it.

```http
POST /api/ai/pages/:pageId/blocks/:blockId/vectorize
```

Request:

```ts
type VectorizeBlockRequest = {
  workspaceId?: string;
};
```

`workspaceId` is optional because the backend can derive it from the page.

Response:

```ts
type VectorizeBlockResponse = {
  data:
    | { indexed: true; embeddingId: string; dimensions: number }
    | { indexed: false; reason: "empty_text" };
};
```

Permission: workspace `editor`, `admin`, or `owner`.

## Vectorize Page

Use this after page import, duplication, or bulk creation.

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

Permission: workspace `editor`, `admin`, or `owner`.

## Vector Search

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

Permission: workspace `viewer` or higher.

Firestore deployment note: vector search requires a Firestore vector index on `embeddings.embedding`, with `workspaceId` as a filter field.

## Recommended Frontend Flows

### Chat Panel

1. User opens the AI panel.
2. Do not send content yet.
3. User submits a prompt.
4. Send `workspaceId`, optional `pageId`, and message history.
5. Use `/chat/stream` for the live typing experience.

### Inline Rewrite

1. User selects text.
2. User chooses a rewrite command.
3. Call `/pages/:pageId/rewrite`.
4. Show a diff or preview.
5. Replace text only after user confirmation.

### Background Vectorization

1. A block is saved.
2. Wait 1-3 seconds after the last edit.
3. Call `/pages/:pageId/blocks/:blockId/vectorize`.
4. Ignore `503` in the editor UI; show AI search unavailable elsewhere.

## Provider Configuration

Backend-only env vars:

```env
NVIDIA_API_KEY=
NVIDIA_AI_MODEL=google/gemma-4-31b-it
NVIDIA_AI_BASE_URL=https://integrate.api.nvidia.com/v1/chat/completions
GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
```

Never expose these in frontend code.
