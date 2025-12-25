import { defineStore } from "pinia";
import { computed, reactive, ref, Ref } from "vue";
import {
  Message,
  MessageStream,
  MessageStreamData,
} from "@/background/aiProvider.js";
import {
  saveConversation,
  saveMessage,
  getConversation,
  getMessagesForConversation,
  checkContextSize,
  compressContext,
  deleteMessagesByConversationAndType,
} from "../aiStorage.js";
import { usePageStore } from "./page.js";
import { useUIStore } from "./ui.js";
import { sendMessage } from "@/shared/messaging.js";
import { VectoriaSearchResult } from "@/background/vectoria-index.js";

interface SidePanelCommunicationMessage {
  type: string;
  payload?: { action: string; matches: VectoriaSearchResult[] };
  data?: MessageStreamData;
}

export interface AutoInsightsState {
  active: boolean;
  action: string;
  loading: boolean;
  error: string;
  markdown: string;
  chunkGroups: number;
  context: any;
  generatedAt: string;
}

export const useChatStore = defineStore("chat", () => {
  const pageStore = usePageStore();

  const conversationId = ref<string | null>(null);
  const messages: Ref<Message[]> = ref([]);
  const isLoading = ref(false);
  const error = ref("");
  const userInput = ref("");
  const sendContext = ref(true);
  const contextInfo = reactive({
    size: 0,
    maxSize: 32768,
    percentage: 0,
    needsCompression: false,
  });

  const activeStream: MessageStream = reactive({
    id: null,
    content: "",
    timestamp: "",
    reasoning: "",
    metadata: {},
  });

  const autoInsights: AutoInsightsState = reactive({
    active: false,
    action: "",
    loading: false,
    error: "",
    markdown: "",
    chunkGroups: 0,
    context: null,
    generatedAt: "",
  });

  const visibleMessages = computed(() => {
    if (sendContext.value) {
      return messages.value;
    }
    return messages.value.filter(
      (msg: Message) =>
        msg.metadata?.type !== "page_context" && msg.role !== "system",
    );
  });

  const hasActiveStream = computed(() => Boolean(activeStream.id));

  function resetActiveStream() {
    activeStream.id = null;
    activeStream.content = "";
    activeStream.timestamp = "";
    activeStream.reasoning = "";
    activeStream.metadata = {};
  }

  function resetAutoInsights() {
    autoInsights.active = false;
    autoInsights.action = "";
    autoInsights.loading = false;
    autoInsights.error = "";
    autoInsights.markdown = "";
    autoInsights.chunkGroups = 0;
    autoInsights.context = null;
    autoInsights.generatedAt = "";
  }

  function buildPageContextMessage(convId: string): Message | null {
    if (!pageStore.pageContent) {
      return null;
    }
    return {
      id: `msg-${Date.now()}`,
      conversationId: convId,
      role: "system",
      content: `页面上下文:\n标题: ${pageStore.pageTitle}\nURL: ${pageStore.currentUrl}\n\n内容:\n${pageStore.pageContent.substring(0, 2000)}`,
      timestamp: new Date().toISOString(),
      metadata: { type: "page_context", url: pageStore.currentUrl },
    };
  }

  async function createNewConversation() {
    try {
      const convId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const conversationData = {
        id: convId,
        url: pageStore.currentUrl,
        title: pageStore.pageTitle || "新对话",
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isAiGenerated: false,
        sendContextEnabled: sendContext.value,
      };

      await saveConversation(conversationData);
      conversationId.value = convId;
      messages.value = [];

      if (sendContext.value) {
        const systemMessage = buildPageContextMessage(convId);
        if (systemMessage) {
          await saveMessage(systemMessage);
          messages.value.push(systemMessage);
        }
      }
    } catch (e) {
      console.error("Failed to create conversation:", e);
      error.value = "创建对话失败: " + (e as Error).message;
    }
  }

  async function loadConversation(convId: string) {
    try {
      const conv = await getConversation(convId);
      if (conv) {
        conversationId.value = conv.id;
        const msgs = await getMessagesForConversation(convId, 1000);
        messages.value = msgs;
        
        const hasContext = msgs.some(
          (msg) =>
            msg.metadata?.type === "page_context" ||
            (msg.role === "system" && !msg.metadata?.type),
        );
        
        if (typeof conv.sendContextEnabled === "boolean") {
          sendContext.value = conv.sendContextEnabled;
        } else {
          sendContext.value = hasContext;
        }
        
        await checkContext();
      }
    } catch (e) {
      console.error("Failed to load conversation:", e);
    }
  }

  async function checkContext() {
    if (!conversationId.value) return;
    try {
      const result = await checkContextSize(
        conversationId.value,
        contextInfo.maxSize,
        {
          includePageContext: sendContext.value,
        },
      );
      contextInfo.size = result.estimatedTokens;
      contextInfo.percentage = result.percentage;
      contextInfo.needsCompression = result.needsCompression;
    } catch (e) {
      console.warn("Context check failed:", e);
    }
  }

  async function persistSendContextPreference(enabled: boolean) {
    if (!conversationId.value) return;
    try {
      const conversation = await getConversation(conversationId.value);
      if (!conversation) return;
      if (conversation.sendContextEnabled === enabled) {
        return;
      }
      conversation.sendContextEnabled = enabled;
      await saveConversation(conversation);
    } catch (e) {
      console.warn("Failed to persist sendContext preference:", e);
    }
  }

  async function sendUserMessage(content: string) {
    if (!conversationId.value) return;

    error.value = "";
    isLoading.value = true;

    try {
      if (contextInfo.needsCompression) {
        // Logic for compression handled in UI or here? 
        // For now, let's assume UI handles confirmation and calls a compress action
      }

      const userMsg: Message = {
        id: `msg-${Date.now()}`,
        conversationId: conversationId.value,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };

      await saveMessage(userMsg);
      messages.value.push(userMsg);
      userInput.value = "";

      // Send to background
      sendMessage("myz:aiStreamRequest", {
        conversationId: conversationId.value,
        message: content,
        context: {
          url: pageStore.currentUrl,
          title: pageStore.pageTitle,
          includePageContext: sendContext.value,
        },
      });
    } catch (e) {
      console.error("Failed to send message:", e);
      error.value = "发送失败: " + (e as Error).message;
      isLoading.value = false;
    }
  }

  async function compressConversationContext() {
    if (!conversationId.value) return;
    const compressed = await compressContext(
      conversationId.value,
      contextInfo.maxSize * 0.5,
    );
    if (compressed.compressed) {
      messages.value = compressed.messages!;
      await checkContext();
    }
  }

  async function runAutoInsights(action: string) {
    if (!pageStore.currentTabId) return;
    
    resetAutoInsights();
    autoInsights.active = true;
    autoInsights.action = action;
    autoInsights.loading = true;

    try {
      const response = await chrome.tabs.sendMessage(pageStore.currentTabId, {
        type: "myz:analyzePage",
        action,
      });

      if (response && response.success) {
        autoInsights.markdown = response.data.markdown;
        autoInsights.chunkGroups = response.data.chunkGroups || 0;
        autoInsights.context = response.data.context;
        autoInsights.generatedAt = new Date().toISOString();
      } else {
        autoInsights.error = response?.error || "分析失败";
      }
    } catch (e) {
      autoInsights.error = (e as Error).message;
    } finally {
      autoInsights.loading = false;
    }
  }

  const isContextPreferenceUpdating = ref(false);
  let runtimeListener: ((message: SidePanelCommunicationMessage) => void) | null = null;

  async function toggleContext(event: Event) {
    const enabled = Boolean(
      (event?.target as HTMLInputElement)?.checked ?? event,
    );
    if (sendContext.value === enabled) {
      return;
    }

    sendContext.value = enabled;
    if (!conversationId.value || isContextPreferenceUpdating.value) {
      return;
    }

    isContextPreferenceUpdating.value = true;
    try {
      if (!enabled) {
        await deleteMessagesByConversationAndType(
          conversationId.value,
          "page_context",
        );
        messages.value = messages.value.filter(
          (msg) =>
            msg.metadata?.type !== "page_context" && msg.role !== "system",
        );
      } else if (!pageStore.pageContent) {
         // If no page content, maybe we can't build context?
         // Original logic checked !hasPageContextMessage() && pageContent.value
         const contextMessage = buildPageContextMessage(conversationId.value);
         if (contextMessage) {
           await saveMessage(contextMessage);
           messages.value = [...messages.value, contextMessage];
         }
      } else {
         // Check if we already have it?
         const hasContext = messages.value.some(m => m.metadata?.type === "page_context");
         if (!hasContext && pageStore.pageContent) {
            const contextMessage = buildPageContextMessage(conversationId.value);
            if (contextMessage) {
              await saveMessage(contextMessage);
              messages.value = [...messages.value, contextMessage];
            }
         }
      }

      await persistSendContextPreference(enabled);
      await checkContext();
    } finally {
      isContextPreferenceUpdating.value = false;
    }
  }

  async function sendMessageAction(content: string) {
    await sendUserMessage(content);
  }

  function closeAutoInsights() {
    resetAutoInsights();
  }

  // Stream handlers
  function handleStreamStartEvent(data: MessageStreamData) {
    if (!data || data.conversationId !== conversationId.value || !data.message) return;
    resetActiveStream();
    const streamId = data.message.id || data.streamId;
    if (!streamId) return;
    
    activeStream.id = streamId;
    activeStream.content = "";
    activeStream.reasoning = "";
    activeStream.timestamp = data.message.timestamp || new Date().toISOString();
    activeStream.metadata = { ...(data.message.metadata || {}), streaming: true };
    
    const uiStore = useUIStore();
    uiStore.scrollToBottom();
  }

  function handleStreamChunkEvent(data: MessageStreamData) {
    if (!data || data.conversationId !== conversationId.value || !data.streamId || activeStream.id !== data.streamId) return;
    
    if (typeof data.delta === "string") activeStream.content = data.delta;
    if (typeof data.reasoning === "string") activeStream.reasoning = data.reasoning;
    
    const uiStore = useUIStore();
    uiStore.scrollToBottom();
  }

  function handleStreamCompleteEvent(data: MessageStreamData) {
    if (!data || data.conversationId !== conversationId.value || !data.streamId || activeStream.id !== data.streamId) return;

    let finalMessage: Message | undefined = data.message;
    if (!finalMessage) {
      finalMessage = {
        id: data.streamId,
        conversationId: conversationId.value,
        role: "assistant",
        content: data.content ?? activeStream.content ?? "",
        timestamp: activeStream.timestamp || new Date().toISOString(),
        metadata: {
          ...(activeStream.metadata || {}),
          streaming: false,
          ...(data.metadata || {}),
        },
      };
    }
    
    // Merge metadata logic from App.tsx
    const mergedMetadata: Record<string, any> = {
      ...(finalMessage.metadata || {}),
      streaming: false,
    };
    const reasoningText = data.reasoning || (data.metadata?.reasoning as string) || (mergedMetadata?.reasoning as string) || activeStream.reasoning || "";
    if (reasoningText) {
      mergedMetadata.reasoning = reasoningText;
      finalMessage.reasoning_content = finalMessage.reasoning_content || reasoningText;
    }
    finalMessage.metadata = mergedMetadata;

    if (data.metadata?.toolNames && !finalMessage.metadata?.toolNames) {
      finalMessage.metadata = { ...(finalMessage.metadata || {}), toolNames: data.metadata.toolNames };
    }
    if (data.metadata?.toolCallDetails && !finalMessage.metadata?.toolCallDetails) {
      finalMessage.metadata = { 
        ...(finalMessage.metadata || {}), 
        toolCallDetails: data.metadata.toolCallDetails,
        hasToolCalls: data.metadata.toolCallDetails.length > 0 
      };
    }
    if (Array.isArray(finalMessage.metadata?.toolNames) && finalMessage.metadata.toolNames.length > 0) {
      finalMessage.metadata.hasToolCalls = true;
    }

    const messageToAppend = { ...finalMessage, metadata: { ...(finalMessage.metadata || {}) } };
    resetActiveStream();
    messages.value.push(messageToAppend);
    
    const uiStore = useUIStore();
    uiStore.scrollToBottom();
    checkContext();
  }

  function handleStreamErrorEvent(data: MessageStreamData) {
    if (!data || data.conversationId !== conversationId.value || !data.streamId || activeStream.id !== data.streamId) return;
    resetActiveStream();
    error.value = data.error ? `AI生成失败: ${data.error}` : "AI生成失败";
  }

  async function handleAutoAction(action: string) {
    if (isLoading.value) return;
    if (action === "summarize" || action === "key_points") {
      await runAutoInsights(action);
      return;
    }
    if (action === "custom") {
      userInput.value = "请问关于当前页面的问题";
    }
    if (userInput.value) {
      await sendUserMessage(userInput.value);
    }
  }

  async function initialize() {
    // Setup listener
    runtimeListener = (message: SidePanelCommunicationMessage) => {
      const uiStore = useUIStore();
      
      if (message.type === "myz:openSidePanelWithAction" && message.payload?.action) {
        setTimeout(() => handleAutoAction(message.payload!.action), 100);
      } else if (message.type === "myz:newMessage" && message.data?.message) {
        const incoming = message.data.message;
        if (conversationId.value && incoming.conversationId === conversationId.value) {
          messages.value.push(incoming);
          uiStore.scrollToBottom();
        }
      } else if (message.type === "myz:aiStreamStart" && message.data) {
        handleStreamStartEvent(message.data);
      } else if (message.type === "myz:aiStreamChunk" && message.data) {
        handleStreamChunkEvent(message.data);
      } else if (message.type === "myz:aiStreamComplete" && message.data) {
        handleStreamCompleteEvent(message.data);
      } else if (message.type === "myz:aiStreamError" && message.data) {
        handleStreamErrorEvent(message.data);
      } else if (message.type === "myz:showRelatedHighlights" && Array.isArray(message.payload?.matches)) {
        pageStore.relatedMatches = message.payload!.matches;
        uiStore.setView("related");
      }
    };
    chrome.runtime.onMessage.addListener(runtimeListener);
    
    // Load initial conversation if needed? 
    // App.tsx didn't seem to do it explicitly in initialize(), but maybe it relied on user interaction or default state.
    // We'll leave it as is.
  }

  function cleanup() {
    if (runtimeListener) {
      chrome.runtime.onMessage.removeListener(runtimeListener);
      runtimeListener = null;
    }
  }

  return {
    conversationId,
    messages,
    visibleMessages,
    isLoading,
    error,
    userInput,
    sendContext,
    contextInfo,
    activeStream,
    hasActiveStream,
    autoInsights,
    isContextPreferenceUpdating,
    resetActiveStream,
    resetAutoInsights,
    createNewConversation,
    loadConversation,
    checkContext,
    persistSendContextPreference,
    sendUserMessage,
    sendMessage: sendMessageAction,
    compressConversationContext,
    runAutoInsights,
    closeAutoInsights,
    toggleContext,
    initialize,
    cleanup,
  };
});
