import { defineStore } from "pinia";
import { computed, reactive, ref, Ref } from "vue";
import { useChatUIStore } from "./chatUi.js";
import {
  Message,
  MessageStream,
  MessageStreamData,
  ImageAttachment,
  MessageMetadata,
  ToolInvocationDetails,
} from "@/background/ai/types.js";
import type { Settings } from "@/background/settings.js";
import { sendMessage } from "@/shared/messaging.js";
import { isRecord, isString, isStringArray } from "@/shared/typeUtils";
import {
  saveConversation,
  getConversation,
  listConversations,
  getMessagesForConversation,
  getConversationStats,
  checkContextSize,
  ConversationInfo,
  deleteConversation,
} from "@/sidepanel/aiStorage.js";

const ACTIVE_CONVERSATION_ID_KEY = "myz::dashboardActiveConversationId";

type AssistantMode = "chat" | "agent";

interface CompactConversationPayload {
  conversationId: string;
  targetTokens?: number;
  keepRecentCount?: number;
}

interface CompactConversationResult {
  compressed: boolean;
  messages: Message[];
  originalCount?: number;
  compressedCount?: number;
  summary?: string;
}

interface DashboardChatRuntimeMessage {
  type: string;
  payload?: unknown;
  data?: MessageStreamData | { conversationId?: string; plan?: unknown };
}

export const useChatStore = defineStore("dashboard-chat", () => {
  const conversationId = ref<string | null>(null);
  const activeConversation = ref<ConversationInfo | null>(null);
  const conversations: Ref<ConversationInfo[]> = ref([]);
  const messages: Ref<Message[]> = ref([]);
  const isLoading = ref(false);
  const isHistoryLoading = ref(false);
  const error = ref("");
  const userInput = ref("");
  const pendingRequestId = ref<string | null>(null);
  const attachments: Ref<ImageAttachment[]> = ref([]);
  const initialized = ref(false);

  const aiConfig = reactive({
    assistantEnabled: false,
    supportsVision: false,
    baseSupportsVision: false,
    compressImages: false,
    configured: false,
    baseContextWindow: 32768,
    multimodalContextWindow: null as number | null,
  });

  const contextInfo = reactive({
    size: 0,
    maxSize: 32768,
    percentage: 0,
    needsCompression: false,
    threshold: 80,
  });

  const activeStream: MessageStream = reactive({
    id: null,
    content: "",
    timestamp: "",
    reasoning: "",
    metadata: {},
  });

  const visibleMessages = computed(() =>
    messages.value
      .filter(
        (msg) =>
          msg.metadata?.type !== "page_context" &&
          (msg.role !== "system" || msg.metadata?.type === "system_event"),
      )
      .filter((msg) => msg.metadata?.type !== "compression_summary"),
  );

  const conversationTitle = computed(() => {
    const title = activeConversation.value?.title || "";
    if (title.trim()) return title;
    const pageTitle =
      typeof activeConversation.value?.metadata?.pageTitle === "string"
        ? activeConversation.value?.metadata?.pageTitle || ""
        : "";
    return pageTitle;
  });

  const hasActiveStream = computed(() => Boolean(activeStream.id));

  const assistantEnabled = computed(() => aiConfig.assistantEnabled);

  const canAttachImages = computed(
    () =>
      aiConfig.assistantEnabled &&
      aiConfig.configured &&
      aiConfig.supportsVision,
  );

  function resolveAssistantMode(value: unknown): AssistantMode {
    if (value === "chat" || value == null) return "chat";
    return "agent";
  }

  const assistantMode = computed(() =>
    resolveAssistantMode(activeConversation.value?.metadata?.assistantMode),
  );

  const isReadOnly = computed(() => assistantMode.value !== "chat");

  function resetAttachments() {
    attachments.value = [];
  }

  function resetActiveStream() {
    activeStream.id = null;
    activeStream.content = "";
    activeStream.timestamp = "";
    activeStream.reasoning = "";
    activeStream.metadata = {};
  }

  async function writeActiveConversationId(convId: string) {
    if (!convId) return;
    try {
      await chrome.storage.local.set({ [ACTIVE_CONVERSATION_ID_KEY]: convId });
    } catch {
      // ignore
    }
  }

  async function readActiveConversationId(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(ACTIVE_CONVERSATION_ID_KEY);
      return (result?.[ACTIVE_CONVERSATION_ID_KEY] as string) || null;
    } catch {
      return null;
    }
  }

  function updateConversationList(next: ConversationInfo) {
    const list = conversations.value.slice();
    const index = list.findIndex((item) => item.id === next.id);
    if (index >= 0) {
      list[index] = next;
    } else {
      list.unshift(next);
    }
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    conversations.value = list;
  }

  async function loadConversations() {
    isHistoryLoading.value = true;
    conversations.value = [];
    try {
      const all = await listConversations(200);
      const filtered: ConversationInfo[] = [];
      for (const conv of all) {
        try {
          const stats = await getConversationStats(conv.id);
          if (stats?.messageCount && stats.messageCount > 0) {
            filtered.push(conv);
          }
        } catch (e) {
          console.warn("Failed to check conversation stats:", conv.id, e);
        }
      }
      conversations.value = filtered;
    } catch (e) {
      console.error("Failed to load conversations:", e);
    } finally {
      isHistoryLoading.value = false;
    }
  }

  async function refreshAiConfig() {
    try {
      const settings = await sendMessage<undefined, Settings>(
        "myz:getSettings",
      );
      aiConfig.assistantEnabled = Boolean(settings?.aiAssistantEnabled);

      const conversation = settings?.aiAgents?.conversation;
      const target = conversation?.target;
      const providerId = target?.providerId;
      const modelId = target?.modelId;
      const providers = Array.isArray(settings?.aiProviders)
        ? settings.aiProviders
        : [];
      const provider = providers.find((p) => p.id === providerId);
      const model = provider?.models?.find((m) => m.id === modelId);

      aiConfig.configured = Boolean(provider && model);
      const baseVision = Boolean(model?.capabilities?.vision);
      aiConfig.baseSupportsVision = baseVision;
      aiConfig.baseContextWindow =
        typeof model?.limits?.contextWindow === "number"
          ? Math.floor(model.limits.contextWindow)
          : 32768;

      const multimodalTarget = conversation?.multimodalTarget;
      let multimodalVision = false;
      let multimodalContextWindow: number | null = null;
      if (multimodalTarget?.providerId && multimodalTarget?.modelId) {
        const multimodalProvider = providers.find(
          (p) => p.id === multimodalTarget.providerId,
        );
        const multimodalModel = multimodalProvider?.models?.find(
          (m) => m.id === multimodalTarget.modelId,
        );
        multimodalVision = Boolean(
          multimodalProvider?.enabled &&
          multimodalProvider?.lastTest?.ok &&
          multimodalModel?.enabled &&
          multimodalModel?.capabilities?.vision,
        );
        if (typeof multimodalModel?.limits?.contextWindow === "number") {
          multimodalContextWindow = Math.floor(
            multimodalModel.limits.contextWindow,
          );
        }
      }

      aiConfig.supportsVision = baseVision || multimodalVision;
      aiConfig.multimodalContextWindow = multimodalContextWindow;
      aiConfig.compressImages = Boolean(conversation?.compressImages);
      contextInfo.maxSize = aiConfig.baseContextWindow || 32768;
      if (typeof conversation?.contextCompressionThreshold === "number") {
        contextInfo.threshold = Math.max(
          50,
          Math.min(95, Math.round(conversation.contextCompressionThreshold)),
        );
      } else {
        contextInfo.threshold = 80;
      }
    } catch {
      aiConfig.assistantEnabled = false;
      aiConfig.supportsVision = false;
      aiConfig.baseSupportsVision = false;
      aiConfig.compressImages = false;
      aiConfig.configured = false;
      aiConfig.baseContextWindow = 32768;
      aiConfig.multimodalContextWindow = null;
      contextInfo.threshold = 80;
    }
  }

  async function checkContext() {
    if (!conversationId.value) return;
    try {
      const result = await checkContextSize(
        conversationId.value,
        contextInfo.maxSize,
        {
          includePageContext: false,
          threshold: contextInfo.threshold,
        },
      );
      contextInfo.size = result.estimatedTokens;
      contextInfo.percentage = result.percentage;
      contextInfo.needsCompression = result.needsCompression;
    } catch (e) {
      console.warn("Context check failed:", e);
    }
  }

  async function touchConversation() {
    if (!activeConversation.value) return;
    const updated = {
      ...activeConversation.value,
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveConversation(updated);
      activeConversation.value = updated;
      updateConversationList(updated);
    } catch (e) {
      console.warn("Failed to update conversation timestamp", e);
    }
  }

  async function createNewConversation() {
    try {
      const convId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();
      const conversationData: ConversationInfo & {
        messages?: Message[];
        isAiGenerated?: boolean;
      } = {
        id: convId,
        url: "",
        title: "",
        createdAt: now,
        updatedAt: now,
        sendContextEnabled: false,
        metadata: {
          assistantMode: "chat",
          pageTitle: "",
          titleGenerated: false,
        },
      };

      await saveConversation(conversationData);
      conversationId.value = convId;
      activeConversation.value = conversationData;
      messages.value = [];
      resetActiveStream();
      isLoading.value = false;
      pendingRequestId.value = null;
      await writeActiveConversationId(convId);
    } catch (e) {
      console.error("Failed to create conversation:", e);
      error.value = "创建对话失败: " + (e as Error).message;
    }
  }

  async function loadConversation(convId: string): Promise<boolean> {
    try {
      const conv = await getConversation(convId);
      if (!conv) return false;
      conversationId.value = conv.id;
      activeConversation.value = conv;
      await writeActiveConversationId(conv.id);
      resetActiveStream();
      isLoading.value = false;
      pendingRequestId.value = null;
      const msgs = await getMessagesForConversation(convId, 1000);
      messages.value = msgs;
      userInput.value = "";
      resetAttachments();
      error.value = "";
      await checkContext();
      return true;
    } catch (e) {
      console.error("Failed to load conversation:", e);
    }
    return false;
  }

  async function deleteConversationById(convId: string) {
    const list = conversations.value.slice();
    const index = list.findIndex((item) => item.id === convId);
    try {
      await deleteConversation(convId);
    } catch (e) {
      console.error("Failed to delete conversation:", e);
      throw e;
    }

    const nextList =
      index >= 0 ? list.filter((item) => item.id !== convId) : list;
    conversations.value = nextList;

    if (conversationId.value === convId) {
      const next =
        nextList[index] || nextList[index - 1] || nextList[0] || null;
      if (next) {
        await loadConversation(next.id);
      } else {
        await createNewConversation();
      }
    }
  }

  async function maybeGenerateConversationTitle(input: string) {
    if (!conversationId.value) return;
    const current = activeConversation.value;
    if (!current) return;
    const titleGenerated = current?.metadata?.titleGenerated;
    if (titleGenerated !== false) return;
    if (!input.trim()) return;

    try {
      const updated = await sendMessage<
        {
          conversationId: string;
          request?: string;
          pageTitle?: string;
          url?: string;
        },
        ConversationInfo
      >("myz:aiTitleRequest", {
        conversationId: current.id,
        request: input,
        pageTitle: "",
        url: "",
      });
      if (updated?.id === current.id) {
        activeConversation.value = updated;
        updateConversationList(updated);
      }
    } catch (e) {
      console.warn("Failed to generate conversation title", e);
    }
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
      mimeType === "image/jpeg" || mimeType === "image/webp"
        ? mimeType
        : "image/png";
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

  async function sendUserMessage(content: string) {
    const trimmed = (content || "").trim();
    if ((!trimmed && attachments.value.length === 0) || isLoading.value) {
      return;
    }

    if (isReadOnly.value) {
      error.value = "该对话为超级模式，仅支持查看";
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
      const useMultimodal =
        attachments.value.length > 0 &&
        !aiConfig.baseSupportsVision &&
        typeof aiConfig.multimodalContextWindow === "number";
      const effectiveMaxSize = useMultimodal
        ? (aiConfig.multimodalContextWindow as number)
        : aiConfig.baseContextWindow;
      contextInfo.maxSize = effectiveMaxSize;
      const contextCheck = await checkContextSize(
        conversationId.value,
        effectiveMaxSize,
        {
          includePageContext: false,
          threshold: contextInfo.threshold,
        },
      );
      contextInfo.size = contextCheck.estimatedTokens;
      contextInfo.percentage = contextCheck.percentage;
      contextInfo.needsCompression = contextCheck.needsCompression;
      if (contextCheck.needsCompression) {
        await compressConversationContext();
      }

      const nextAttachments = await prepareAttachmentsForSend(
        attachments.value,
      );
      const userMsg: Message = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        conversationId: conversationId.value,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
        metadata: {
          ...(nextAttachments.length ? { attachments: nextAttachments } : {}),
        },
      };
      const clientMessageId = userMsg.id;

      messages.value.push(userMsg);
      userInput.value = "";
      resetAttachments();
      if (trimmed) {
        void maybeGenerateConversationTitle(trimmed);
      }
      void touchConversation();

      void sendMessage("myz:aiStreamRequest", {
        conversationId: conversationId.value,
        message: trimmed,
        action: "custom",
        attachments: nextAttachments,
        clientMessageId,
        options: { conversationMode: "chat" },
        context: {
          url: "",
          title: "",
          includePageContext: false,
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
    const compressed = await sendMessage<
      CompactConversationPayload,
      CompactConversationResult
    >("myz:compactConversation", {
      conversationId: conversationId.value,
      targetTokens: contextInfo.maxSize * 0.5,
    });
    if (compressed?.compressed && Array.isArray(compressed.messages)) {
      messages.value = compressed.messages;
      await checkContext();
    }
  }

  function isToolInvocationDetailsArray(
    value: unknown,
  ): value is ToolInvocationDetails[] {
    if (!Array.isArray(value)) return false;
    return value.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.arguments === "string" &&
        (item.response === undefined || typeof item.response === "string"),
    );
  }

  function handleStreamStartEvent(data: MessageStreamData) {
    if (!data || data.conversationId !== conversationId.value || !data.message)
      return;
    resetActiveStream();
    const streamId = data.message.id || data.streamId;
    if (!streamId) return;

    activeStream.id = streamId;
    activeStream.content = "";
    activeStream.reasoning = "";
    activeStream.timestamp = data.message.timestamp || new Date().toISOString();
    activeStream.metadata = {
      ...(data.message.metadata || {}),
      streaming: true,
    };

    const uiStore = useChatUIStore();
    uiStore.scrollToBottom();
  }

  function handleStreamChunkEvent(data: MessageStreamData) {
    if (
      !data ||
      data.conversationId !== conversationId.value ||
      !data.streamId ||
      activeStream.id !== data.streamId
    ) {
      return;
    }

    if (typeof data.delta === "string") activeStream.content = data.delta;
    if (typeof data.reasoning === "string")
      activeStream.reasoning = data.reasoning;

    const uiStore = useChatUIStore();
    uiStore.scrollToBottom();
  }

  function handleStreamCompleteEvent(data: MessageStreamData) {
    if (
      !data ||
      data.conversationId !== conversationId.value ||
      !data.streamId ||
      activeStream.id !== data.streamId
    ) {
      return;
    }

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

    const mergedMetadata: MessageMetadata = {
      ...(finalMessage.metadata || {}),
      streaming: false,
    };
    const reasoningText =
      data.reasoning ||
      (typeof data.metadata?.reasoning === "string"
        ? data.metadata.reasoning
        : "") ||
      (typeof mergedMetadata?.reasoning === "string"
        ? mergedMetadata.reasoning
        : "") ||
      activeStream.reasoning ||
      "";
    if (reasoningText) {
      mergedMetadata.reasoning = reasoningText;
      finalMessage.reasoning_content =
        finalMessage.reasoning_content || reasoningText;
    }
    finalMessage.metadata = mergedMetadata;

    const rawToolNames = data.metadata?.toolNames;
    const toolNames = isStringArray(rawToolNames)
      ? rawToolNames
      : isString(rawToolNames)
        ? rawToolNames
        : null;
    const rawToolCallDetails = data.metadata?.toolCallDetails;
    const toolCallDetails = isToolInvocationDetailsArray(rawToolCallDetails)
      ? rawToolCallDetails
      : null;
    if (toolNames && !finalMessage.metadata?.toolNames) {
      finalMessage.metadata = {
        ...(finalMessage.metadata || {}),
        toolNames,
      };
    }
    if (toolCallDetails && !finalMessage.metadata?.toolCallDetails) {
      finalMessage.metadata = {
        ...(finalMessage.metadata || {}),
        toolCallDetails,
        hasToolCalls: toolCallDetails.length > 0,
      };
    }
    if (
      Array.isArray(finalMessage.metadata?.toolNames) &&
      finalMessage.metadata.toolNames.length > 0
    ) {
      finalMessage.metadata.hasToolCalls = true;
    }

    const messageToAppend = {
      ...finalMessage,
      metadata: { ...(finalMessage.metadata || {}) },
    };
    resetActiveStream();
    messages.value.push(messageToAppend);
    isLoading.value = false;
    pendingRequestId.value = null;

    void touchConversation();

    const uiStore = useChatUIStore();
    uiStore.scrollToBottom();
    void checkContext();
  }

  function handleStreamErrorEvent(data: MessageStreamData) {
    if (
      !data ||
      data.conversationId !== conversationId.value ||
      !data.streamId ||
      activeStream.id !== data.streamId
    ) {
      return;
    }
    resetActiveStream();
    error.value = data.error ? `AI生成失败: ${data.error}` : "AI生成失败";
    isLoading.value = false;
    pendingRequestId.value = null;
  }

  function handleSkillSelection(data: MessageStreamData) {
    if (!data.conversationId || data.conversationId !== conversationId.value) {
      return;
    }
    if (!data.clientMessageId) {
      return;
    }
    const skillNames = Array.isArray(data.skillNames)
      ? data.skillNames.map((name) => String(name).trim()).filter(Boolean)
      : [];
    if (skillNames.length === 0) {
      return;
    }
    const index = messages.value.findIndex(
      (msg) => msg.id === data.clientMessageId,
    );
    if (index >= 0) {
      const existing = messages.value[index];
      messages.value[index] = {
        ...existing,
        metadata: {
          ...(existing.metadata || {}),
          skillNames,
        },
      };
    }
  }

  let runtimeListener: ((message: DashboardChatRuntimeMessage) => void) | null =
    null;

  async function initialize() {
    if (initialized.value) return;
    initialized.value = true;

    runtimeListener = (message: DashboardChatRuntimeMessage) => {
      if (
        message.type === "myz:newMessage" &&
        (message.data as MessageStreamData)?.message
      ) {
        const incoming = (message.data as MessageStreamData).message!;
        if (
          conversationId.value &&
          incoming.conversationId === conversationId.value
        ) {
          messages.value.push(incoming);
          if (incoming.role === "assistant") {
            isLoading.value = false;
            pendingRequestId.value = null;
          }
          void touchConversation();
          const uiStore = useChatUIStore();
          uiStore.scrollToBottom();
        }
      } else if (message.type === "myz:aiSkillSelection" && message.data) {
        handleSkillSelection(message.data as MessageStreamData);
      } else if (message.type === "myz:aiStreamStart" && message.data) {
        handleStreamStartEvent(message.data as MessageStreamData);
      } else if (message.type === "myz:aiStreamChunk" && message.data) {
        handleStreamChunkEvent(message.data as MessageStreamData);
      } else if (message.type === "myz:aiStreamComplete" && message.data) {
        handleStreamCompleteEvent(message.data as MessageStreamData);
      } else if (message.type === "myz:aiStreamError" && message.data) {
        handleStreamErrorEvent(message.data as MessageStreamData);
      }
    };
    chrome.runtime.onMessage.addListener(runtimeListener);

    await refreshAiConfig();
    await loadConversations();

    const savedId = await readActiveConversationId();
    if (savedId && (await loadConversation(savedId))) {
      return;
    }

    if (conversations.value.length) {
      await loadConversation(conversations.value[0].id);
      return;
    }

    await createNewConversation();
  }

  function cleanup() {
    if (runtimeListener) {
      chrome.runtime.onMessage.removeListener(runtimeListener);
      runtimeListener = null;
    }
    initialized.value = false;
  }

  return {
    conversationId,
    activeConversation,
    conversations,
    messages,
    visibleMessages,
    isLoading,
    isHistoryLoading,
    error,
    userInput,
    attachments,
    assistantEnabled,
    assistantMode,
    isReadOnly,
    canAttachImages,
    contextInfo,
    activeStream,
    hasActiveStream,
    conversationTitle,
    loadConversations,
    createNewConversation,
    loadConversation,
    deleteConversationById,
    refreshAiConfig,
    addImageFiles,
    removeAttachment,
    resetAttachments,
    resetActiveStream,
    sendUserMessage,
    checkContext,
    compressConversationContext,
    initialize,
    cleanup,
  };
});
