/**
 * IndexedDB storage for AI conversations
 * Uses a more robust storage mechanism for large conversation data
 */

import { Message } from "@/background/ai/types.js";
import { normalizeTokenUsage } from "@myz/ai-core/tokenUsage";
import { AI_SCHEMA_VERSION } from "@/shared/versioning";
import type { UnknownRecord } from "@/shared/typeUtils";

const DB_NAME = "MyZAIAssistantDB";
const DB_VERSION = 1;
const CONVERSATIONS_STORE = "conversations";
const MESSAGES_STORE = "messages";

function normalizeConversation(
  conversation: ConversationInfo,
): ConversationInfo {
  return {
    ...conversation,
    schemaVersion: conversation.schemaVersion || AI_SCHEMA_VERSION,
  };
}

function normalizeMessage(message: Message): Message {
  return {
    ...message,
    schemaVersion: message.schemaVersion || AI_SCHEMA_VERSION,
  };
}

let db: IDBDatabase | null = null;

export interface ConversationInfo {
  schemaVersion?: string;
  id: string;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  metadata?: UnknownRecord;
  sendContextEnabled?: boolean;
}

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Conversations store
      if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        const conversationStore = db.createObjectStore(CONVERSATIONS_STORE, {
          keyPath: "id",
        });
        conversationStore.createIndex("url", "url", { unique: false });
        conversationStore.createIndex("updatedAt", "updatedAt", {
          unique: false,
        });
      }

      // Messages store
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        const messageStore = db.createObjectStore(MESSAGES_STORE, {
          keyPath: "id",
        });
        messageStore.createIndex("conversationId", "conversationId", {
          unique: false,
        });
        messageStore.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

export async function saveConversation(
  conversation: ConversationInfo,
): Promise<ConversationInfo> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATIONS_STORE], "readwrite");
    const store = transaction.objectStore(CONVERSATIONS_STORE);

    const normalized = normalizeConversation(conversation);
    const request = store.put(normalized);
    request.onsuccess = () => resolve(normalized);
    request.onerror = () => reject(request.error);
  });
}

export async function getConversation(
  conversationId: string,
): Promise<ConversationInfo | null> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATIONS_STORE], "readonly");
    const store = transaction.objectStore(CONVERSATIONS_STORE);

    const request = store.get(conversationId);
    request.onsuccess = () => {
      const result = request.result || null;
      resolve(result ? normalizeConversation(result) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function listConversations(
  limit = 100,
  offset = 0,
): Promise<ConversationInfo[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATIONS_STORE], "readonly");
    const store = transaction.objectStore(CONVERSATIONS_STORE);
    const index = store.index("updatedAt");

    const request = index.openCursor(null, "prev");
    const conversations: ConversationInfo[] = [];
    let count = 0;
    let skipped = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && count < limit) {
        if (skipped < offset) {
          skipped++;
          cursor.continue();
        } else {
          conversations.push(normalizeConversation(cursor.value));
          count++;
          cursor.continue();
        }
      } else {
        resolve(conversations);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function deleteConversation(conversationId: string) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [CONVERSATIONS_STORE, MESSAGES_STORE],
      "readwrite",
    );

    // Delete conversation
    const conversationStore = transaction.objectStore(CONVERSATIONS_STORE);
    conversationStore.delete(conversationId);

    // Delete all messages for this conversation
    const messageStore = transaction.objectStore(MESSAGES_STORE);
    const messageIndex = messageStore.index("conversationId");
    const messageRequest = messageIndex.openCursor(
      IDBKeyRange.only(conversationId),
    );

    messageRequest.onsuccess = () => {
      const cursor = messageRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve({ success: true });
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveMessage(message: Message) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MESSAGES_STORE], "readwrite");
    const store = transaction.objectStore(MESSAGES_STORE);

    const normalized = normalizeMessage(message);
    const request = store.put(normalized);
    request.onsuccess = () => resolve(normalized);
    request.onerror = () => reject(request.error);
  });
}

export async function replaceConversationMessages(
  conversationId: string,
  messages: Message[],
) {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([MESSAGES_STORE], "readwrite");
    const store = transaction.objectStore(MESSAGES_STORE);
    const index = store.index("conversationId");
    const request = index.openCursor(IDBKeyRange.only(conversationId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        messages.forEach((message) => store.put(normalizeMessage(message)));
      }
    };

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function updateConversationMetadata(
  conversationId: string,
  patch: UnknownRecord,
) {
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;
  const next = {
    ...conversation,
    metadata: {
      ...(conversation.metadata || {}),
      ...(patch || {}),
    },
    updatedAt: new Date().toISOString(),
  };
  await saveConversation(next);
  return next;
}

export async function deleteMessagesByConversationAndType(
  conversationId: string,
  metadataType: string,
) {
  if (!conversationId || !metadataType) {
    return;
  }
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MESSAGES_STORE], "readwrite");
    const store = transaction.objectStore(MESSAGES_STORE);
    const index = store.index("conversationId");
    const request = index.openCursor(IDBKeyRange.only(conversationId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const record = cursor.value;
        const matchesLegacySystem =
          metadataType === "page_context" && record?.role === "system";
        if (record?.metadata?.type === metadataType || matchesLegacySystem) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getMessagesForConversation(
  conversationId: string,
  limit = 100,
  offset = 0,
): Promise<Message[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MESSAGES_STORE], "readonly");
    const store = transaction.objectStore(MESSAGES_STORE);
    const index = store.index("conversationId");

    // Use 'next' to get chronological order (oldest first)
    // IndexDB messages are stored in insertion order:
    // system (first), user (second), assistant (third), tool (fourth), assistant (fifth)
    // Use getAll for reliable timestamp-based sorting
    const request = index.getAll(IDBKeyRange.only(conversationId));

    request.onsuccess = () => {
      let allMessages = request.result || [];

      // Sort by timestamp to ensure chronological order (oldest first)
      allMessages.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      // Apply offset and limit
      const messages = allMessages.slice(offset, offset + limit);
      resolve(messages);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getConversationStats(
  conversationId: string,
): Promise<{ messageCount: number }> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MESSAGES_STORE], "readonly");
    const store = transaction.objectStore(MESSAGES_STORE);
    const index = store.index("conversationId");

    const request = index.count(IDBKeyRange.only(conversationId));
    request.onsuccess = () => {
      resolve({ messageCount: request.result });
    };
    request.onerror = () => reject(request.error);
  });
}

export async function checkContextSize(
  conversationId: string,
  maxTokens: number,
  options: { includePageContext?: boolean; threshold?: number } = {},
) {
  const { includePageContext = true, threshold = 80 } = options;
  let messages = await getMessagesForConversation(conversationId, 1000);

  if (!includePageContext) {
    messages = messages.filter((msg) => msg.metadata?.type !== "page_context");
  }
  messages = messages.filter((msg) => msg.metadata?.type !== "system_event");

  const usageTokens = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      const includeFlag =
        typeof msg.metadata?.includePageContext === "boolean"
          ? msg.metadata.includePageContext
          : null;
      if (includeFlag !== null && includeFlag !== includePageContext) {
        continue;
      }
      const usage = normalizeTokenUsage(msg.metadata?.usage);
      const total =
        typeof usage?.total_tokens === "number" ? usage.total_tokens : null;
      const prompt =
        typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null;
      const candidate = total ?? prompt;
      if (
        typeof candidate === "number" &&
        Number.isFinite(candidate) &&
        candidate > 0
      ) {
        return Math.floor(candidate);
      }
    }
    return null;
  })();

  let estimatedTokens = 0;
  if (usageTokens) {
    estimatedTokens = usageTokens;
  } else {
    // Estimate token count (rough approximation: 1 token ~ 4 chars)
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += JSON.stringify(msg).length;
    }
    estimatedTokens = Math.floor(totalChars / 4);
  }
  const percentage = (estimatedTokens / maxTokens) * 100;

  return {
    estimatedTokens,
    maxTokens,
    percentage,
    needsCompression: percentage >= threshold,
  };
}
