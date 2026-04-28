import { env } from "../config/env";
import { firestore } from "../config/firebase";
import { canEdit, canView, getWorkspaceRole } from "./permission.service";
import { forbidden, HttpError, notFound } from "../utils/http-error";

type AiMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatInput = {
  workspaceId: string;
  pageId?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  selectedText?: string;
  mode: "ask" | "explain" | "brainstorm" | "draft";
};

type GenerateInput = {
  workspaceId: string;
  prompt: string;
  insertMode: "append" | "replace_selection" | "after_block";
  afterBlockId?: string;
  selectedText?: string;
};

type RewriteInput = {
  workspaceId: string;
  selectedText: string;
  instruction: "improve" | "shorten" | "expand" | "fix_grammar" | "make_professional" | "make_casual" | "custom";
  customInstruction?: string;
};

type NvidiaChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function assertAiConfigured() {
  if (!env.NVIDIA_API_KEY) {
    throw new HttpError(503, "AI provider is not configured");
  }
}

async function assertWorkspaceView(workspaceId: string, uid: string) {
  const role = await getWorkspaceRole(workspaceId, uid);
  if (!canView(role)) throw forbidden();
}

async function assertWorkspaceEdit(workspaceId: string, uid: string) {
  const role = await getWorkspaceRole(workspaceId, uid);
  if (!canEdit(role)) throw forbidden();
}

async function loadPageContext(pageId: string | undefined, workspaceId: string, uid: string) {
  if (!pageId) return "";

  const pageSnapshot = await firestore.doc(`pages/${pageId}`).get();
  if (!pageSnapshot.exists || pageSnapshot.get("isDeleted")) throw notFound("Page not found");
  if (pageSnapshot.get("workspaceId") !== workspaceId) throw forbidden("Page does not belong to workspace");

  await assertWorkspaceView(workspaceId, uid);

  const blockSnapshot = await firestore.collection(`pages/${pageId}/blocks`)
    .where("isDeleted", "==", false)
    .orderBy("order", "asc")
    .limit(80)
    .get();

  const title = String(pageSnapshot.get("title") ?? "Untitled");
  const blocks = blockSnapshot.docs
    .map((doc) => {
      const type = String(doc.get("type") ?? "paragraph");
      const content = doc.get("content") as Record<string, unknown> | undefined;
      return `- ${type}: ${JSON.stringify(content ?? {})}`;
    })
    .join("\n");

  return `Current page title: ${title}\nCurrent page blocks:\n${blocks}`;
}

function buildSystemPrompt(mode: ChatInput["mode"], pageContext: string, selectedText?: string): AiMessage {
  const modeInstructions: Record<ChatInput["mode"], string> = {
    ask: "Answer the user's question using workspace context when it is relevant.",
    explain: "Explain clearly and concretely. Prefer concise structure.",
    brainstorm: "Generate practical options and tradeoffs. Avoid filler.",
    draft: "Draft useful page-ready content. Keep formatting simple."
  };

  return {
    role: "system",
    content: [
      "You are the AI assistant for a collaborative Notion-like workspace.",
      "Respect user privacy and only use the context provided by the backend.",
      "Do not claim access to data that is not present in the prompt.",
      modeInstructions[mode],
      pageContext ? `\nWorkspace context:\n${pageContext}` : "",
      selectedText ? `\nUser-selected text:\n${selectedText}` : ""
    ].filter(Boolean).join("\n")
  };
}

async function callGemma(messages: AiMessage[], stream: false): Promise<NvidiaChatResponse>;
async function callGemma(messages: AiMessage[], stream: true): Promise<Response>;
async function callGemma(messages: AiMessage[], stream: boolean) {
  assertAiConfigured();

  const response = await fetch(env.NVIDIA_AI_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
      Accept: stream ? "text/event-stream" : "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.NVIDIA_AI_MODEL,
      messages,
      max_tokens: 16384,
      temperature: 1,
      top_p: 0.95,
      stream,
      chat_template_kwargs: { enable_thinking: true }
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new HttpError(response.status >= 500 ? 502 : response.status, "AI provider request failed", details.slice(0, 500));
  }

  if (stream) return response;
  return await response.json() as NvidiaChatResponse;
}

export async function chatWithAi(uid: string, input: ChatInput) {
  await assertWorkspaceView(input.workspaceId, uid);
  const pageContext = await loadPageContext(input.pageId, input.workspaceId, uid);
  const messages = [
    buildSystemPrompt(input.mode, pageContext, input.selectedText),
    ...input.messages
  ];

  const result = await callGemma(messages, false);
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new HttpError(502, "AI provider returned an empty response");

  return {
    message: { role: "assistant", content },
    usage: result.usage ? {
      inputTokens: result.usage.prompt_tokens,
      outputTokens: result.usage.completion_tokens,
      totalTokens: result.usage.total_tokens
    } : undefined
  };
}

export async function streamChatWithAi(uid: string, input: ChatInput) {
  await assertWorkspaceView(input.workspaceId, uid);
  const pageContext = await loadPageContext(input.pageId, input.workspaceId, uid);
  return callGemma([
    buildSystemPrompt(input.mode, pageContext, input.selectedText),
    ...input.messages
  ], true);
}

export async function summarizePage(uid: string, pageId: string, input: { workspaceId: string; style: "brief" | "detailed" | "action_items" }) {
  await assertWorkspaceView(input.workspaceId, uid);
  const context = await loadPageContext(pageId, input.workspaceId, uid);
  const prompt = `Summarize this page in ${input.style} style. If action_items is requested, return clear bullet action items.`;
  const result = await callGemma([
    buildSystemPrompt("ask", context),
    { role: "user", content: prompt }
  ], false);

  return { summary: result.choices?.[0]?.message?.content ?? "", usage: result.usage };
}

export async function rewriteSelection(uid: string, pageId: string, input: RewriteInput) {
  await assertWorkspaceEdit(input.workspaceId, uid);
  await loadPageContext(pageId, input.workspaceId, uid);

  const instruction = input.instruction === "custom" ? input.customInstruction! : input.instruction.replace(/_/g, " ");
  const result = await callGemma([
    {
      role: "system",
      content: "Rewrite the selected text according to the instruction. Return only the rewritten text."
    },
    {
      role: "user",
      content: `Instruction: ${instruction}\n\nSelected text:\n${input.selectedText}`
    }
  ], false);

  return { text: result.choices?.[0]?.message?.content ?? "", usage: result.usage };
}

export async function generatePageContent(uid: string, pageId: string, input: GenerateInput) {
  await assertWorkspaceEdit(input.workspaceId, uid);
  const context = await loadPageContext(pageId, input.workspaceId, uid);
  const result = await callGemma([
    {
      role: "system",
      content: [
        "Generate content for a Notion-like page.",
        "Return readable Markdown only. The backend/frontend may convert it into blocks later.",
        context ? `Current page context:\n${context}` : ""
      ].filter(Boolean).join("\n")
    },
    {
      role: "user",
      content: `Prompt: ${input.prompt}\nInsert mode: ${input.insertMode}\nSelected text: ${input.selectedText ?? ""}`
    }
  ], false);

  const previewText = result.choices?.[0]?.message?.content ?? "";
  return {
    previewText,
    blocks: [{ type: "paragraph", content: { text: previewText } }],
    usage: result.usage
  };
}
