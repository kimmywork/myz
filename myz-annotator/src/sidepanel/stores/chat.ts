import { defineStore } from "pinia";
import { computed, reactive, ref, Ref } from "vue";
import {
  saveConversation,
  saveMessage,
  getConversation,
  listConversations,
  getMessagesForConversation,
  checkContextSize,
  deleteMessagesByConversationAndType,
  updateConversationMetadata,
  ConversationInfo,
} from "../aiStorage.js";
import { usePageStore } from "./page.js";
import { useTaskPlanStore } from "./taskPlan.js";
import { useUIStore } from "./ui.js";
import type { TaskPlan } from "@/background/ai/tasks/taskManager.js";
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
import type { JsonRecord, UnknownRecord } from "@/shared/typeUtils";
import { isRecord, isString, isStringArray } from "@/shared/typeUtils";

const ACTIVE_CONVERSATION_ID_KEY = "myz::activeConversationId";

type ConversationMode = "agent" | "chat";
type AutoAction =
  | "summarize"
  | "key_points"
  | "interpret_image"
  | "interpret_selection"
  | "custom";

type UiAttachment = Pick<
  ImageAttachment,
  "type" | "dataUrl" | "mimeType" | "name"
>;

interface SidePanelActionPayload {
  action?: AutoAction;
  draftId?: string;
  tabId?: number;
  prompt?: string;
  attachments?: ImageAttachment[];
  selectionText?: string;
  selectionAttachment?: ImageAttachment;
}

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

interface SidePanelCommunicationMessage {
  type: string;
  payload?: SidePanelActionPayload;
  data?: MessageStreamData | { conversationId?: string; plan?: TaskPlan };
}

export interface AutoInsightsState {
  active: boolean;
  action: string;
  loading: boolean;
  error: string;
  markdown: string;
  chunkGroups: number;
  context: JsonRecord | null;
  generatedAt: string;
}

export const useChatStore = defineStore("chat", () => {
  const pageStore = usePageStore();
  const taskPlanStore = useTaskPlanStore();

  const conversationId = ref<string | null>(null);
  const activeConversation = ref<ConversationInfo | null>(null);
  const messages: Ref<Message[]> = ref([]);
  const isLoading = ref(false);
  const error = ref("");
  const userInput = ref("");
  const pendingRequestId = ref<string | null>(null);
  const sendContext = ref(false);
  const attachments: Ref<UiAttachment[]> = ref([]);
  const aiConfig = reactive({
    assistantEnabled: false,
    supportsVision: false,
    baseSupportsVision: false,
    compressImages: false,
    configured: false,
    superpowerMode: false,
    baseContextWindow: 32768,
    multimodalContextWindow: null as number | null,
  });
  const conversationMode = ref<"agent" | "chat">("chat");
  const superpowerEnabled = computed(() => aiConfig.superpowerMode);
  const isAgentMode = computed(
    () => aiConfig.superpowerMode && conversationMode.value === "agent",
  );
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
    const base = sendContext.value
      ? messages.value
      : messages.value.filter(
          (msg: Message) =>
            msg.metadata?.type !== "page_context" &&
            (msg.role !== "system" || msg.metadata?.type === "system_event"),
        );
    return base.filter(
      (msg: Message) => msg.metadata?.type !== "compression_summary",
    );
  });

  const conversationUrl = computed(() => activeConversation.value?.url || "");
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

  const canAttachImages = computed(
    () =>
      aiConfig.assistantEnabled &&
      aiConfig.configured &&
      aiConfig.supportsVision,
  );

  const draftContext = reactive<{
    present: boolean;
    enabled: boolean;
    kind: "selection" | null;
    text: string;
    attachments: UiAttachment[];
  }>({
    present: false,
    enabled: false,
    kind: null,
    text: "",
    attachments: [],
  });

  function normalizeConversationMode(value: unknown): ConversationMode {
    return value === "chat" ? "chat" : "agent";
  }

  function resolveConversationMode(value: unknown): ConversationMode {
    return aiConfig.superpowerMode ? normalizeConversationMode(value) : "chat";
  }

  function normalizeAutoAction(value: unknown): AutoAction | null {
    if (value === "summarize") return "summarize";
    if (value === "key_points") return "key_points";
    if (value === "interpret_image") return "interpret_image";
    if (value === "interpret_selection") return "interpret_selection";
    if (value === "custom") return "custom";
    return null;
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

  async function maybeGenerateConversationTitle(input: string) {
    if (!conversationId.value) return;
    const current = activeConversation.value;
    if (!current) return;
    const titleGenerated = current?.metadata?.titleGenerated;
    if (titleGenerated !== false) return;
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
        pageTitle: pageStore.pageTitle,
        url: pageStore.currentUrl,
      });
      if (updated?.id === current.id) {
        activeConversation.value = updated;
      }
    } catch (e) {
      console.warn("Failed to generate conversation title", e);
    }
  }

  async function setConversationMode(mode: "agent" | "chat") {
    const nextMode = resolveConversationMode(mode);
    if (conversationMode.value === nextMode) return;
    conversationMode.value = nextMode;
    if (!conversationId.value) return;
    try {
      const updated = await updateConversationMetadata(conversationId.value, {
        assistantMode: nextMode,
      });
      if (updated) {
        activeConversation.value = updated;
      }
    } catch (e) {
      console.warn("Failed to update conversation mode", e);
    }
  }

  function clearDraftContext() {
    draftContext.present = false;
    draftContext.enabled = false;
    draftContext.kind = null;
    draftContext.text = "";
    draftContext.attachments = [];
  }

  function removeDraftAttachment(index: number) {
    draftContext.attachments = draftContext.attachments.filter(
      (_, i) => i !== index,
    );
  }

  function resetAttachments() {
    attachments.value = [];
  }

  function normalizeUiAttachments(value: unknown): UiAttachment[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is UiAttachment =>
          isRecord(item) &&
          item.type === "image" &&
          typeof item.dataUrl === "string" &&
          item.dataUrl.length > 0,
      )
      .map((item) => ({
        type: "image",
        dataUrl: item.dataUrl,
        mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
        name: typeof item.name === "string" ? item.name : undefined,
      }));
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

  async function writeActiveConversationId(convId: string) {
    if (!convId) return;
    try {
      await chrome.storage.local.set({ [ACTIVE_CONVERSATION_ID_KEY]: convId });
    } catch {
      // ignore
    }
  }

  function buildPageContextMessage(convId: string): Message | null {
    if (!pageStore.pageContent) {
      return null;
    }
    const baseTimestamp =
      activeConversation.value?.createdAt || new Date().toISOString();
    return {
      id: `page-context-${convId}`,
      conversationId: convId,
      role: "system",
      content: `页面上下文:\n标题: ${pageStore.pageTitle}\nURL: ${pageStore.currentUrl}\n\n内容:\n${pageStore.pageContent.substring(0, 2000)}`,
      timestamp: baseTimestamp,
      metadata: { type: "page_context", url: pageStore.currentUrl },
    };
  }

  async function ensurePageContextMessage(convId: string) {
    if (!convId) return;
    if (!sendContext.value) return;

    if (!pageStore.pageContent) {
      await pageStore.loadPageContext(pageStore.currentTabId ?? undefined, {
        includeContent: true,
      });
    }
    const contextMessage = buildPageContextMessage(convId);
    if (!contextMessage) return;

    await deleteMessagesByConversationAndType(convId, "page_context");
    await saveMessage(contextMessage);
    messages.value = [
      contextMessage,
      ...messages.value.filter(
        (msg) =>
          msg.metadata?.type !== "page_context" &&
          (msg.role !== "system" || msg.metadata?.type === "system_event"),
      ),
    ];
  }

  async function createNewConversation() {
    try {
      const convId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const url = pageStore.currentUrl || "";
      const title = "";
      const pageTitle = pageStore.pageTitle || "";
      const defaultMode = resolveConversationMode("agent");
      const conversationData: ConversationInfo & {
        messages?: Message[];
        isAiGenerated?: boolean;
      } = {
        id: convId,
        url,
        title,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isAiGenerated: false,
        sendContextEnabled: sendContext.value,
        metadata: {
          assistantMode: defaultMode,
          pageTitle,
          titleGenerated: false,
        },
      };

      await saveConversation(conversationData);
      conversationId.value = convId;
      activeConversation.value = conversationData;
      conversationMode.value = defaultMode;
      messages.value = [];
      await writeActiveConversationId(convId);
      await taskPlanStore.loadPlan(convId);

      if (sendContext.value) {
        await ensurePageContextMessage(convId);
      }
    } catch (e) {
      console.error("Failed to create conversation:", e);
      error.value = "创建对话失败: " + (e as Error).message;
    }
  }

  async function startNewConversationForContext() {
    // Preserve InputComposer state (userInput / attachments / draftContext) when
    // creating a new conversation so users can keep editing and send in the new thread.
    error.value = "";
    await createNewConversation();
  }

  function normalizeUrlForMatch(url: string) {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return (url || "").split("#")[0] || "";
    }
  }

  async function findLatestConversationForUrl(
    url: string,
  ): Promise<ConversationInfo | null> {
    const targetUrl = normalizeUrlForMatch(url || "");
    if (!targetUrl) return null;
    try {
      const conversations = await listConversations(200);
      const found = conversations.find(
        (conv) => normalizeUrlForMatch(conv.url || "") === targetUrl,
      );
      return found || null;
    } catch (e) {
      console.warn("Failed to find conversation for url", e);
      return null;
    }
  }

  async function switchToLatestConversationForCurrentContext(options?: {
    createIfMissing?: boolean;
  }) {
    const currentUrl = normalizeUrlForMatch(pageStore.currentUrl || "");
    if (!currentUrl) {
      if (options?.createIfMissing) {
        await startNewConversationForContext();
      }
      return;
    }

    const found = await findLatestConversationForUrl(currentUrl);
    if (found) {
      userInput.value = "";
      resetAttachments();
      clearDraftContext();
      error.value = "";
      await loadConversation(found.id);
      return;
    }

    if (options?.createIfMissing) {
      await startNewConversationForContext();
    }
  }

  async function loadConversation(convId: string): Promise<boolean> {
    try {
      const conv = await getConversation(convId);
      if (conv) {
        conversationId.value = conv.id;
        activeConversation.value = conv;
        conversationMode.value = resolveConversationMode(
          conv.metadata?.assistantMode,
        );
        await writeActiveConversationId(conv.id);
        await taskPlanStore.loadPlan(conv.id);
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
        return true;
      }
    } catch (e) {
      console.error("Failed to load conversation:", e);
    }
    return false;
  }

  async function checkContext() {
    if (!conversationId.value) return;
    try {
      const result = await checkContextSize(
        conversationId.value,
        contextInfo.maxSize,
        {
          includePageContext: sendContext.value,
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
      activeConversation.value = conversation;
    } catch (e) {
      console.warn("Failed to persist sendContext preference:", e);
    }
  }

  async function sendUserMessage(content: string) {
    const trimmed = (content || "").trim();
    const autoMode = isAgentMode.value;
    const cleanedMessage = trimmed
      .replace(/\b(ulw|ultrawork)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const effectiveMessage = cleanedMessage || trimmed;
    const draftEnabled = Boolean(draftContext.present && draftContext.enabled);
    const draftText = draftEnabled ? (draftContext.text || "").trim() : "";
    const draftAttachments = draftEnabled
      ? draftContext.attachments.slice(0)
      : [];
    const combinedAttachments = [
      ...(draftEnabled ? draftAttachments : []),
      ...attachments.value,
    ];
    const resolvedConversationMode = aiConfig.superpowerMode
      ? conversationMode.value
      : "chat";

    if (
      (!trimmed && !combinedAttachments.length && !draftText) ||
      isLoading.value
    ) {
      return;
    }
    if (
      autoMode &&
      !cleanedMessage &&
      !combinedAttachments.length &&
      !draftText
    ) {
      error.value = "请提供一句话任务描述";
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
      if (sendContext.value && conversationId.value) {
        await ensurePageContextMessage(conversationId.value);
      }

      const useMultimodal =
        combinedAttachments.length > 0 &&
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
          includePageContext: sendContext.value,
          threshold: contextInfo.threshold,
        },
      );
      contextInfo.size = contextCheck.estimatedTokens;
      contextInfo.percentage = contextCheck.percentage;
      contextInfo.needsCompression = contextCheck.needsCompression;
      if (contextCheck.needsCompression) {
        await compressConversationContext();
      }

      const nextAttachments =
        await prepareAttachmentsForSend(combinedAttachments);
      const selectionContextText = draftEnabled && draftText ? draftText : "";
      const userMsg: Message = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        conversationId: conversationId.value,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
        metadata: {
          ...(nextAttachments.length ? { attachments: nextAttachments } : {}),
          ...(selectionContextText ? { selectionContextText } : {}),
        },
      };
      const clientMessageId = userMsg.id;

      messages.value.push(userMsg);
      void maybeGenerateConversationTitle(trimmed);
      userInput.value = "";
      resetAttachments();
      clearDraftContext();

      // Send to background (streaming via runtime messages)
      void sendMessage("myz:aiStreamRequest", {
        conversationId: conversationId.value,
        message: effectiveMessage,
        action: "custom",
        attachments: nextAttachments,
        clientMessageId,
        options: selectionContextText
          ? {
              conversationMode: resolvedConversationMode,
              metadata: {
                selectionContextText,
              },
            }
          : { conversationMode: resolvedConversationMode },
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

  async function runAutoInsights(action: string) {
    if (!pageStore.currentTabId) return;

    resetAutoInsights();
    autoInsights.active = true;
    autoInsights.action = action;
    autoInsights.loading = true;

    try {
      const envelope = await chrome.tabs.sendMessage(pageStore.currentTabId, {
        type: "myz:analyzePage",
        payload: { action },
      });
      if (isRecord(envelope) && envelope.ok === false) {
        throw new Error(
          typeof envelope.error === "string" ? envelope.error : "分析失败",
        );
      }
      const result =
        isRecord(envelope) && "data" in envelope
          ? (envelope.data as unknown)
          : envelope;
      const resultRecord = isRecord(result) ? result : null;

      if (resultRecord && resultRecord.success === true) {
        autoInsights.markdown =
          typeof resultRecord.markdown === "string"
            ? resultRecord.markdown
            : "";
        autoInsights.chunkGroups =
          typeof resultRecord.chunkGroups === "number"
            ? resultRecord.chunkGroups
            : 0;
        autoInsights.context = isRecord(resultRecord.context)
          ? (resultRecord.context as JsonRecord)
          : null;
        autoInsights.generatedAt =
          typeof resultRecord.generatedAt === "string"
            ? resultRecord.generatedAt
            : new Date().toISOString();
      } else {
        autoInsights.error =
          typeof resultRecord?.error === "string"
            ? resultRecord.error
            : "分析失败";
      }
    } catch (e) {
      autoInsights.error = (e as Error).message;
    } finally {
      autoInsights.loading = false;
    }
  }

  const isContextPreferenceUpdating = ref(false);
  let runtimeListener:
    ((message: SidePanelCommunicationMessage) => void) | null = null;

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
            msg.metadata?.type !== "page_context" &&
            (msg.role !== "system" || msg.metadata?.type === "system_event"),
        );
      } else if (!pageStore.pageContent) {
        await ensurePageContextMessage(conversationId.value);
      } else {
        // Check if we already have it?
        const hasContext = messages.value.some(
          (m) => m.metadata?.type === "page_context",
        );
        if (!hasContext && pageStore.pageContent) {
          await ensurePageContextMessage(conversationId.value);
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

    const uiStore = useUIStore();
    uiStore.scrollToBottom();
  }

  function handleStreamChunkEvent(data: MessageStreamData) {
    if (
      !data ||
      data.conversationId !== conversationId.value ||
      !data.streamId ||
      activeStream.id !== data.streamId
    )
      return;

    if (typeof data.delta === "string") activeStream.content = data.delta;
    if (typeof data.reasoning === "string")
      activeStream.reasoning = data.reasoning;

    const uiStore = useUIStore();
    uiStore.scrollToBottom();
  }

  function handleStreamCompleteEvent(data: MessageStreamData) {
    if (
      !data ||
      data.conversationId !== conversationId.value ||
      !data.streamId ||
      activeStream.id !== data.streamId
    )
      return;

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

    const uiStore = useUIStore();
    uiStore.scrollToBottom();
    checkContext();
  }

  function handleStreamErrorEvent(data: MessageStreamData) {
    if (
      !data ||
      data.conversationId !== conversationId.value ||
      !data.streamId ||
      activeStream.id !== data.streamId
    )
      return;
    resetActiveStream();
    error.value = data.error ? `AI生成失败: ${data.error}` : "AI生成失败";
    isLoading.value = false;
    pendingRequestId.value = null;
  }

  const lastSidePanelAction = ref<UnknownRecord | null>(null);

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
      aiConfig.superpowerMode = Boolean(conversation?.superpowerMode);
      contextInfo.maxSize = aiConfig.baseContextWindow || 32768;
      if (typeof conversation?.contextCompressionThreshold === "number") {
        contextInfo.threshold = Math.max(
          50,
          Math.min(95, Math.round(conversation.contextCompressionThreshold)),
        );
      } else {
        contextInfo.threshold = 80;
      }
      if (!aiConfig.superpowerMode) {
        conversationMode.value = "chat";
      }
    } catch {
      aiConfig.assistantEnabled = false;
      aiConfig.supportsVision = false;
      aiConfig.baseSupportsVision = false;
      aiConfig.compressImages = false;
      aiConfig.superpowerMode = false;
      aiConfig.configured = false;
      aiConfig.baseContextWindow = 32768;
      aiConfig.multimodalContextWindow = null;
      contextInfo.threshold = 80;
      conversationMode.value = "chat";
    }
  }

  async function handleAutoAction(action: string) {
    if (isLoading.value) return;
    if (action === "summarize" || action === "key_points") {
      await runAutoInsights(action);
      return;
    }
    if (action === "interpret_image") {
      const payload: UnknownRecord = isRecord(lastSidePanelAction.value)
        ? lastSidePanelAction.value
        : {};
      clearDraftContext();
      resetAttachments();
      const nextAttachments = normalizeUiAttachments(payload.attachments);
      if (nextAttachments.length) {
        attachments.value = nextAttachments;
      }
      userInput.value =
        typeof payload.prompt === "string" && payload.prompt.trim()
          ? payload.prompt.trim()
          : "请解读这张图片的内容";
      return;
    }
    if (action === "interpret_selection") {
      const payload: UnknownRecord = isRecord(lastSidePanelAction.value)
        ? lastSidePanelAction.value
        : {};
      resetAttachments();
      const selectionText =
        typeof payload.selectionText === "string"
          ? payload.selectionText.trim()
          : "";
      const selectionAttachments = normalizeUiAttachments(
        payload.selectionAttachment ? [payload.selectionAttachment] : [],
      );

      draftContext.present = true;
      draftContext.enabled = true;
      draftContext.kind = "selection";
      draftContext.text = selectionText;
      draftContext.attachments = selectionAttachments;

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
    const uiStore = useUIStore();
    // Setup listener
    runtimeListener = (message: SidePanelCommunicationMessage) => {
      if (
        message.type === "myz:openSidePanelWithAction" &&
        message.payload?.action
      ) {
        lastSidePanelAction.value = isRecord(message.payload)
          ? message.payload
          : null;
        const tabId =
          typeof message.payload?.tabId === "number"
            ? message.payload.tabId
            : null;
        if (typeof tabId === "number") {
          void pageStore.loadPageContext(tabId, { includeContent: false });
        }
        if (message.payload?.draftId) {
          void sendMessage("myz:ackSidePanelAction", {
            draftId: message.payload.draftId,
          }).catch(() => {});
        }
        const action = normalizeAutoAction(message.payload?.action);
        if (action) {
          setTimeout(() => handleAutoAction(action), 100);
        }
      } else if (
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
          uiStore.scrollToBottom();
        }
      } else if (message.type === "myz:taskPlanUpdated" && message.data) {
        const payload = isRecord(message.data) ? message.data : null;
        const plan = payload?.plan as TaskPlan | undefined;
        if (
          typeof payload?.conversationId === "string" &&
          payload.conversationId === conversationId.value
        ) {
          taskPlanStore.setPlan(plan || null);
        }
      } else if (message.type === "myz:aiSkillSelection" && message.data) {
        const data = message.data! as MessageStreamData;
        if (
          !data.conversationId ||
          data.conversationId !== conversationId.value
        ) {
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

    // Establish initial context (URL/title) before creating a new conversation.
    // - If opened from a draft action, use its originating tab.
    // - Otherwise use the current active tab.
    try {
      const pending = await sendMessage<
        undefined,
        SidePanelActionPayload | null
      >("myz:popSidePanelAction");
      if (pending?.action) {
        const pendingRecord: UnknownRecord = { ...pending };
        lastSidePanelAction.value = pendingRecord;
        const tabId = typeof pending?.tabId === "number" ? pending.tabId : null;
        if (typeof tabId === "number") {
          await pageStore.loadPageContext(tabId, { includeContent: false });
        }
        const action = normalizeAutoAction(pending.action);
        if (action) {
          setTimeout(() => handleAutoAction(action), 80);
        }
      } else {
        await pageStore.loadPageContext(undefined, { includeContent: false });
      }
    } catch {
      try {
        await pageStore.loadPageContext(undefined, { includeContent: false });
      } catch {}
    }

    // On each SidePanel open/reload, start a fresh conversation.
    // Keep InputComposer state (drafts/attachments/text) intact.
    await createNewConversation();
  }

  function cleanup() {
    if (runtimeListener) {
      chrome.runtime.onMessage.removeListener(runtimeListener);
      runtimeListener = null;
    }
  }

  return {
    conversationId,
    activeConversation,
    conversationUrl,
    conversationTitle,
    messages,
    visibleMessages,
    isLoading,
    error,
    userInput,
    sendContext,
    attachments,
    contextInfo,
    canAttachImages,
    superpowerEnabled,
    conversationMode,
    isAgentMode,
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
    setConversationMode,
    initialize,
    cleanup,
    startNewConversationForContext,
    switchToLatestConversationForCurrentContext,
    findLatestConversationForUrl,
  };
});
