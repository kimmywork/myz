export const AI_CONVERSATION_KEY = "myz::ai-conversations";
export const AI_MCP_SERVERS_KEY = "myz::ai-mcp-servers";

export const DEFAULT_AI_CONVERSATION_STATE = {
  conversations: {},
  activeConversationId: null,
};

export function generateConversationId() {
  return `ai-conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function readAiConversations() {
  const result = await chrome.storage.local.get(AI_CONVERSATION_KEY);
  return result[AI_CONVERSATION_KEY] || { ...DEFAULT_AI_CONVERSATION_STATE };
}

export async function writeAiConversations(state) {
  if (!state || typeof state !== "object") {
    throw new Error("Invalid AI conversation state");
  }
  await chrome.storage.local.set({ [AI_CONVERSATION_KEY]: state });
  return state;
}

export function createConversation(url, title) {
  const id = generateConversationId();
  const now = new Date().toISOString();
  return {
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
  conversationId,
  role,
  content,
  metadata = {},
) {
  const state = await readAiConversations();
  const conversation = state.conversations[conversationId];
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  const message = {
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

export async function getConversationHistory(conversationId, limit = 50) {
  const state = await readAiConversations();
  const conversation = state.conversations[conversationId];
  if (!conversation) {
    return [];
  }
  return conversation.messages.slice(-limit);
}

export async function saveAiGeneratedHighlight(highlightData) {
  const state = await readAiConversations();
  const conversation = state.conversations[highlightData.conversationId];
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

  return aiHighlight;
}

export async function exportConversation(conversationId, format = "markdown") {
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

  conversation.messages.forEach((msg) => {
    const role = msg.role === "user" ? "**User**" : "**Assistant**";
    const time = new Date(msg.timestamp).toLocaleString();
    markdown += `${role} (${time}):\n\n`;
    markdown += `${msg.content}\n\n`;
    markdown += `---\n\n`;
  });

  return markdown;
}

export async function deleteConversation(conversationId) {
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
