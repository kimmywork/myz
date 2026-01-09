import { defineStore } from "pinia";
import { computed, reactive, ref, Ref } from "vue";
import {
  Message,
  MessageStream,
  MessageStreamData,
  ImageAttachment,
} from "@/background/ai/types.js";
import type { Settings } from "@/background/settings.js";
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
  payload?: {
    action?: string;
    matches?: VectoriaSearchResult[];
    prompt?: string;
    attachments?: ImageAttachment[];
    selectionText?: string;
    selectionAttachment?: ImageAttachment;
  };
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
  const pendingRequestId = ref<string | null>(null);
  const sendContext = ref(true);
  const attachments: Ref<ImageAttachment[]> = ref([]);
  const aiConfig = reactive({
    assistantEnabled: false,
    supportsVision: false,
    compressImages: false,
    configured: false,
  });
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

  const canAttachImages = computed(
    () => aiConfig.assistantEnabled && aiConfig.configured && aiConfig.supportsVision,
  );

  const draftContext = reactive<{
    present: boolean;
    enabled: boolean;
    kind: "selection" | null;
    text: string;
    attachments: ImageAttachment[];
  }>({
    present: false,
    enabled: false,
    kind: null,
    text: "",
    attachments: [],
  });

  function clearDraftContext() {
    draftContext.present = false;
    draftContext.enabled = false;
    draftContext.kind = null;
    draftContext.text = "";
    draftContext.attachments = [];
  }

  function removeDraftAttachment(index: number) {
    draftContext.attachments = draftContext.attachments.filter((_, i) => i !== index);
  }

  function resetAttachments() {
    attachments.value = [];
  }

  function inferMimeTypeFromDataUrl(dataUrl: string) {
    const match = /^data:([^;]+);base64,/.exec(dataUrl || "");
    return match?.[1] || "";
  }

  async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = dataUrl;
    });
  }

  async function maybeCompressImage(
    attachment: ImageAttachment,
    maxSize = 640,
  ): Promise<ImageAttachment> {
    if (!aiConfig.compressImages) {
      return attachment;
    }
    const dataUrl = attachment.dataUrl || "";
    if (!dataUrl.startsWith("data:")) {
      return attachment;
    }

    const img = await loadImage(dataUrl);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const maxDim = Math.max(width, height);
    if (!maxDim || maxDim <= maxSize) {
      return attachment;
    }

    const scale = maxSize / maxDim;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return attachment;
    }
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const mimeType =
      attachment.mimeType || inferMimeTypeFromDataUrl(dataUrl) || "image/png";
    const outputMime =
      mimeType === "image/jpeg" || mimeType === "image/webp" ? mimeType : "image/png";
    const nextDataUrl =
      outputMime === "image/jpeg" || outputMime === "image/webp"
        ? canvas.toDataURL(outputMime, 0.9)
        : canvas.toDataURL(outputMime);

    return {
      ...attachment,
      dataUrl: nextDataUrl,
      mimeType: outputMime,
    };
  }

  async function prepareAttachmentsForSend(
    list: ImageAttachment[],
  ): Promise<ImageAttachment[]> {
    if (!list.length) {
      return [];
    }
    if (!canAttachImages.value) {
      throw new Error("当前模型不支持 Vision，无法发送图片");
    }
    return Promise.all(list.map((item) => maybeCompressImage(item)));
  }

  async function addImageFiles(files: FileList | null | undefined) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    if (!canAttachImages.value) {
      error.value = "当前模型不支持 Vision，无法添加图片";
      return;
    }

    const next: ImageAttachment[] = [];
    for (const file of list) {
      if (!file || !file.type || !file.type.startsWith("image/")) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(file);
      });
      if (!dataUrl.startsWith("data:")) continue;
      next.push({
        type: "image",
        dataUrl,
        mimeType: file.type,
        name: file.name,
      });
    }

    if (next.length) {
      attachments.value = [...attachments.value, ...next];
    }
  }

  function removeAttachment(index: number) {
    attachments.value = attachments.value.filter((_, i) => i !== index);
  }

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
    const trimmed = (content || "").trim();
    const draftEnabled = Boolean(draftContext.present && draftContext.enabled);
    const draftText = draftEnabled ? (draftContext.text || "").trim() : "";
    const draftAttachments = draftEnabled
      ? draftContext.attachments.slice(0)
      : [];
    const combinedAttachments = [
      ...(draftEnabled ? draftAttachments : []),
      ...attachments.value,
    ];

    if ((!trimmed && !combinedAttachments.length && !draftText) || isLoading.value) {
      return;
    }

    if (!conversationId.value) {
      await createNewConversation();
    }
    if (!conversationId.value) {
      error.value = "创建对话失败";
      return;
    }

    error.value = "";
    isLoading.value = true;
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    pendingRequestId.value = requestId;

    try {
      if (contextInfo.needsCompression) {
        // Logic for compression handled in UI or here? 
        // For now, let's assume UI handles confirmation and calls a compress action
      }

      const nextAttachments = await prepareAttachmentsForSend(combinedAttachments);
      const finalContent =
        draftEnabled && draftText
          ? `${draftContext.kind === "selection" ? "选中内容（上下文）" : "上下文"}:\n${draftText}\n\n${trimmed || ""}`.trim()
          : trimmed;
      const userMsg: Message = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        conversationId: conversationId.value,
        role: "user",
        content: finalContent,
        timestamp: new Date().toISOString(),
        metadata: nextAttachments.length ? { attachments: nextAttachments } : undefined,
      };

      messages.value.push(userMsg);
      userInput.value = "";
      resetAttachments();
      clearDraftContext();

      // Send to background (streaming via runtime messages)
      void sendMessage("myz:aiStreamRequest", {
        conversationId: conversationId.value,
        message: finalContent,
        action: "custom",
        attachments: nextAttachments,
        context: {
          url: pageStore.currentUrl,
          title: pageStore.pageTitle,
          includePageContext: sendContext.value,
        },
      }).catch((e) => {
        if (pendingRequestId.value !== requestId) {
          return;
        }
        if (hasActiveStream.value) {
          return;
        }
        pendingRequestId.value = null;
        error.value = "发送失败: " + (e as Error).message;
        isLoading.value = false;
      });
    } catch (e) {
      console.error("Failed to send message:", e);
      error.value = "发送失败: " + (e as Error).message;
      pendingRequestId.value = null;
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
      const envelope: any = await chrome.tabs.sendMessage(pageStore.currentTabId, {
        type: "myz:analyzePage",
        payload: { action },
      });
      if (envelope?.ok === false) {
        throw new Error(envelope?.error || "分析失败");
      }
      const result = envelope?.data ?? envelope;

      if (result && result.success) {
        autoInsights.markdown = result.markdown;
        autoInsights.chunkGroups = result.chunkGroups || 0;
        autoInsights.context = result.context;
        autoInsights.generatedAt = result.generatedAt || new Date().toISOString();
      } else {
        autoInsights.error = result?.error || "分析失败";
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
    isLoading.value = false;
    pendingRequestId.value = null;
    
    const uiStore = useUIStore();
    uiStore.scrollToBottom();
    checkContext();
  }

  function handleStreamErrorEvent(data: MessageStreamData) {
    if (!data || data.conversationId !== conversationId.value || !data.streamId || activeStream.id !== data.streamId) return;
    resetActiveStream();
    error.value = data.error ? `AI生成失败: ${data.error}` : "AI生成失败";
    isLoading.value = false;
    pendingRequestId.value = null;
  }

  const lastSidePanelAction = ref<SidePanelCommunicationMessage["payload"] | null>(
    null,
  );

  async function refreshAiConfig() {
    try {
      const settings = (await sendMessage<any, Settings>("myz:getSettings")) as any;
      aiConfig.assistantEnabled = Boolean(settings?.aiAssistantEnabled);

      const target = settings?.aiAgents?.conversation?.target;
      const providerId = target?.providerId;
      const modelId = target?.modelId;
      const provider = (settings?.aiProviders || []).find((p: any) => p.id === providerId);
      const model = (provider?.models || []).find((m: any) => m.id === modelId);

      aiConfig.configured = Boolean(provider && model);
      aiConfig.supportsVision = Boolean(model?.capabilities?.vision);
      aiConfig.compressImages = Boolean(settings?.aiAgents?.conversation?.compressImages);
    } catch {
      aiConfig.assistantEnabled = false;
      aiConfig.supportsVision = false;
      aiConfig.compressImages = false;
      aiConfig.configured = false;
    }
  }

  async function handleAutoAction(action: string) {
    if (isLoading.value) return;
    if (action === "summarize" || action === "key_points") {
      await runAutoInsights(action);
      return;
    }
    if (action === "interpret_image") {
      const payload = lastSidePanelAction.value || {};
      clearDraftContext();
      resetAttachments();
      if (Array.isArray(payload.attachments) && payload.attachments.length) {
        attachments.value = payload.attachments;
      }
      userInput.value =
        typeof payload.prompt === "string" && payload.prompt.trim()
          ? payload.prompt.trim()
          : "请解读这张图片的内容";
      return;
    }
    if (action === "interpret_selection") {
      const payload = lastSidePanelAction.value || {};
      resetAttachments();
      const selectionText =
        typeof payload.selectionText === "string" ? payload.selectionText.trim() : "";
      const selectionAttachment =
        payload.selectionAttachment && payload.selectionAttachment.type === "image"
          ? payload.selectionAttachment
          : null;

      draftContext.present = true;
      draftContext.enabled = true;
      draftContext.kind = "selection";
      draftContext.text = selectionText;
      draftContext.attachments = selectionAttachment ? [selectionAttachment] : [];

      userInput.value =
        typeof payload.prompt === "string" && payload.prompt.trim()
          ? payload.prompt.trim()
          : "请解读选中内容";
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
        lastSidePanelAction.value = message.payload || null;
        setTimeout(() => handleAutoAction(message.payload!.action as any), 100);
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

    await refreshAiConfig();
    
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
    attachments,
    contextInfo,
    canAttachImages,
    addImageFiles,
    removeAttachment,
    resetAttachments,
    refreshAiConfig,
    draftContext,
    clearDraftContext,
    removeDraftAttachment,
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
