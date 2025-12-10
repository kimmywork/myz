/**
 * IndexedDB storage for AI conversations
 * Uses a more robust storage mechanism for large conversation data
 */

const DB_NAME = "MyZAIAssistantDB";
const DB_VERSION = 1;
const CONVERSATIONS_STORE = "conversations";
const MESSAGES_STORE = "messages";

let db = null;

export async function initDB() {
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
      const db = event.target.result;

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

export async function saveConversation(conversation) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATIONS_STORE], "readwrite");
    const store = transaction.objectStore(CONVERSATIONS_STORE);

    const request = store.put(conversation);
    request.onsuccess = () => resolve(conversation);
    request.onerror = () => reject(request.error);
  });
}

export async function getConversation(conversationId) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATIONS_STORE], "readonly");
    const store = transaction.objectStore(CONVERSATIONS_STORE);

    const request = store.get(conversationId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function listConversations(limit = 100, offset = 0) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATIONS_STORE], "readonly");
    const store = transaction.objectStore(CONVERSATIONS_STORE);
    const index = store.index("updatedAt");

    const request = index.openCursor(null, "prev");
    const conversations = [];
    let count = 0;
    let skipped = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && count < limit) {
        if (skipped < offset) {
          skipped++;
          cursor.continue();
        } else {
          conversations.push(cursor.value);
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

export async function deleteConversation(conversationId) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [CONVERSATIONS_STORE, MESSAGES_STORE],
      "readwrite",
    );

    // Delete conversation
    const conversationStore = transaction.objectStore(CONVERSATIONS_STORE);
    const deleteConversationRequest = conversationStore.delete(conversationId);

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

export async function saveMessage(message) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MESSAGES_STORE], "readwrite");
    const store = transaction.objectStore(MESSAGES_STORE);

    const request = store.put(message);
    request.onsuccess = () => resolve(message);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMessagesByConversationAndType(
  conversationId,
  metadataType,
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
  conversationId,
  limit = 100,
  offset = 0,
) {
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

export async function getConversationStats(conversationId) {
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
  conversationId,
  maxTokens,
  options = {},
) {
  const { includePageContext = true } = options;
  let messages = await getMessagesForConversation(conversationId, 1000);

  if (!includePageContext) {
    messages = messages.filter((msg) => msg.metadata?.type !== "page_context");
  }

  // Estimate token count (rough approximation: 1 token ~ 4 chars)
  let totalChars = 0;
  for (const msg of messages) {
    totalChars += JSON.stringify(msg).length;
  }

  const estimatedTokens = Math.floor(totalChars / 4);
  const percentage = (estimatedTokens / maxTokens) * 100;

  return {
    estimatedTokens,
    maxTokens,
    percentage,
    needsCompression: percentage >= 80,
  };
}

export async function compressContext(conversationId, targetTokens) {
  const messages = await getMessagesForConversation(conversationId, 1000);

  if (messages.length === 0) return { compressed: false };

  // Simple compression: keep system and recent messages, summarize older ones
  const systemMessages = messages.filter((m) => m.role === "system");
  const recentMessages = messages.slice(-10); // Keep last 10 messages
  const oldMessages = messages.slice(0, -10);

  if (oldMessages.length === 0) return { compressed: false, messages };

  // Create summary of old messages (use assistant role, not system)
  const summary = {
    id: `summary-${Date.now()}`,
    conversationId,
    role: "assistant",
    content: `[对话上下文已压缩] 前面有 ${oldMessages.length} 条历史消息被压缩，以节省token空间。`,
    timestamp: new Date().toISOString(),
    metadata: { type: "compression_summary" },
  };

  const compressedMessages = [...systemMessages, summary, ...recentMessages];

  return {
    compressed: true,
    originalCount: messages.length,
    compressedCount: compressedMessages.length,
    messages: compressedMessages,
  };
}
