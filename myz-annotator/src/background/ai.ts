import {
  CONTENT_TYPES,
  type MyZRecord,
  ensureRecordSchemaVersion,
} from "@/shared/types.ts";
import type { JsonRecord } from "@/shared/typeUtils";
import { AI_SCHEMA_VERSION } from "@/shared/versioning";

export const AI_CONVERSATION_KEY = "myz::ai-conversations";
export const AI_MCP_SERVERS_KEY = "myz::ai-mcp-servers";

export const DEFAULT_AI_CONVERSATION_STATE: AiConversationState = {
  conversations: {},
  activeConversationId: null,
};

export interface ConversationMessage {
  schemaVersion?: string;
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata: JsonRecord;
}

export interface AiConversation {
  schemaVersion?: string;
  id: string;
  url: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
  isAiGenerated: boolean;
}

export interface AiConversationState {
  conversations: Record<string, AiConversation>;
  activeConversationId: string | null;
}

export function generateConversationId() {
  return `ai-conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function readAiConversations(): Promise<AiConversationState> {
  const result = await chrome.storage.local.get(AI_CONVERSATION_KEY);
  return (
    (result[AI_CONVERSATION_KEY] as AiConversationState) || {
      ...DEFAULT_AI_CONVERSATION_STATE,
    }
  );
}

export async function writeAiConversations(state: AiConversationState) {
  if (!state || typeof state !== "object") {
    throw new Error("Invalid AI conversation state");
  }
  await chrome.storage.local.set({ [AI_CONVERSATION_KEY]: state });
  return state;
}

export function createConversation(url: string, title: string): AiConversation {
  const id = generateConversationId();
  const now = new Date().toISOString();
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    id,
    url: url || "",
    title: title || "新对话",
    messages: [],
    createdAt: now,
    updatedAt: now,
    isAiGenerated: false,
  };
}

export async function addMessageToConversation(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string,
  metadata: JsonRecord = {},
): Promise<ConversationMessage> {
  const state = await readAiConversations();
  const conversation = state.conversations[conversationId];
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  const message: ConversationMessage = {
    schemaVersion: AI_SCHEMA_VERSION,
    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
    metadata: { ...metadata },
  };
  conversation.messages.push(message);
  conversation.updatedAt = new Date().toISOString();
  await writeAiConversations(state);
  return message;
}

export async function getConversationHistory(
  conversationId: string,
  limit = 50,
) {
  const state = await readAiConversations();
  const conversation = state.conversations[conversationId];
  if (!conversation) {
    return [];
  }
  return conversation.messages.slice(-limit);
}

export async function saveAiGeneratedHighlight(
  highlightData: Partial<MyZRecord>,
) {
  const state = await readAiConversations();
  const conversation = state.conversations[highlightData.conversationId!];
  if (conversation) {
    conversation.isAiGenerated = true;
    await writeAiConversations(state);
  }

  const now = new Date().toISOString();
  const aiHighlight = {
    id: highlightData.id || generateConversationId(),
    kind: "ai-generated",
    text: highlightData.text || "",
    note: highlightData.note || "",
    tags: Array.isArray(highlightData.tags)
      ? highlightData.tags
      : ["ai-generated"],
    contentType: CONTENT_TYPES.MARKDOWN,
    url: highlightData.url || "",
    title: highlightData.title || "",
    createdAt: now,
    updatedAt: now,
    conversationId: highlightData.conversationId,
    aiMetadata: {
      prompt: highlightData.prompt || "",
      model: highlightData.model || "",
      action: highlightData.action || "",
    },
  };

  return ensureRecordSchemaVersion(aiHighlight as MyZRecord) as MyZRecord;
}

export async function exportConversation(
  conversationId: string,
  format = "markdown",
) {
  const state = await readAiConversations();
  const conversation = state.conversations[conversationId];
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  if (format === "json") {
    return JSON.stringify(conversation, null, 2);
  }

  let markdown = `# ${conversation.title}\n\n`;
  markdown += `**URL**: ${conversation.url}\n\n`;
  markdown += `**Created**: ${conversation.createdAt}\n\n`;
  markdown += `---\n\n`;

  conversation.messages.forEach((msg: ConversationMessage) => {
    const role = msg.role === "user" ? "**User**" : "**Assistant**";
    const time = new Date(msg.timestamp).toLocaleString();
    markdown += `${role} (${time}):\n\n`;
    markdown += `${msg.content}\n\n`;
    markdown += `---\n\n`;
  });

  return markdown;
}

export async function deleteConversation(conversationId: string) {
  const state = await readAiConversations();
  if (state.conversations[conversationId]) {
    delete state.conversations[conversationId];
    if (state.activeConversationId === conversationId) {
      state.activeConversationId = null;
    }
    await writeAiConversations(state);
  }
}

export async function listConversations(limit = 100) {
  const state = await readAiConversations();
  return Object.values(state.conversations)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}
