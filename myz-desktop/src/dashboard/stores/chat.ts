import { defineStore } from "pinia";
import { computed, reactive, ref, type Ref } from "vue";
import type {
  ConversationInfo,
  ImageAttachment,
  Message,
  MessageStream,
} from "@myz/ai-core/types";
import type { AIAssistantSettings } from "@myz/ai-core/settings";
import { resolveAgentTarget } from "@myz/ai-core/runtime/agentSelection";
import {
  desktopChatHost,
  type DesktopWorkspaceContext,
} from "../../host/desktop";
import {
  streamDesktopConversation,
  deriveConversationTitle,
} from "../services/chatRuntime";
import { useSettingsStore } from "./settings";
import { useChatUIStore } from "./chatUi";

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneAttachments(items: ImageAttachment[]) {
  return items.map((item) => ({
    ...item,
  }));
}

function inferMimeTypeFromDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,/.exec(dataUrl || "");
  return match?.[1] || "";
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = dataUrl;
  });
}

async function maybeCompressImage(
  attachment: ImageAttachment,
  shouldCompress: boolean,
  maxSize = 1280,
): Promise<ImageAttachment> {
  if (!shouldCompress) {
    return attachment;
  }
  if (!attachment.dataUrl.startsWith("data:")) {
    return attachment;
  }

  const image = await loadImage(attachment.dataUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const maxDimension = Math.max(width, height);
  if (!maxDimension || maxDimension <= maxSize) {
    return attachment;
  }

  const scale = maxSize / maxDimension;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return attachment;
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  const mimeType =
    attachment.mimeType || inferMimeTypeFromDataUrl(attachment.dataUrl);
  const outputMime =
    mimeType === "image/jpeg" || mimeType === "image/webp"
      ? mimeType
      : "image/png";
  const dataUrl =
    outputMime === "image/jpeg" || outputMime === "image/webp"
      ? canvas.toDataURL(outputMime, 0.9)
      : canvas.toDataURL(outputMime);

  return {
    ...attachment,
    dataUrl,
    mimeType: outputMime,
  };
}

export const useChatStore = defineStore("desktop-chat", () => {
  const settingsStore = useSettingsStore();
  const conversationId = ref<string | null>(null);
  const activeConversation = ref<ConversationInfo | null>(null);
  const conversations: Ref<ConversationInfo[]> = ref([]);
  const messages: Ref<Message[]> = ref([]);
  const attachments: Ref<ImageAttachment[]> = ref([]);
  const isLoading = ref(false);
  const isHistoryLoading = ref(false);
  const error = ref("");
  const userInput = ref("");
  const initialized = ref(false);
  const workspaceContext = ref<DesktopWorkspaceContext | null>(null);

  const activeStream: MessageStream = reactive({
    id: null,
    content: "",
    timestamp: "",
    reasoning: "",
    metadata: {},
  });

  const visibleMessages = computed(() =>
    messages.value.filter(
      (message) =>
        message.metadata?.type !== "streaming_preview" &&
        message.metadata?.type !== "compression_summary",
    ),
  );

  const conversationTitle = computed(() => {
    const title = activeConversation.value?.title || "";
    return title.trim() || "未命名对话";
  });

  const conversationTargetSummary = computed(() => {
    const target = settingsStore.settings.aiAgents.conversation.target;
    if (!target?.providerId || !target?.modelId) {
      return "未配置聊天模型";
    }
    const provider = settingsStore.settings.aiProviders.find(
      (item) => item.id === target.providerId,
    );
    const model = provider?.models.find((item) => item.id === target.modelId);
    if (!provider || !model?.model) {
      return "聊天模型配置无效";
    }
    return `${provider.name} / ${model.model}`;
  });

  const conversationConnectionSummary = computed(() => {
    const target = settingsStore.settings.aiAgents.conversation.target;
    if (!target?.providerId || !target?.modelId) {
      return "请先在设置中选择 Conversation 模型";
    }
    const provider = settingsStore.settings.aiProviders.find(
      (item) => item.id === target.providerId,
    );
    const model = provider?.models.find((item) => item.id === target.modelId);
    if (!provider || !model?.model) {
      return "当前 Conversation 模型引用已失效";
    }
    if (!provider.lastTest) {
      return "尚未执行该 Provider 的连接测试";
    }
    if (provider.lastTest.model !== model.model) {
      return `最近验证模型：${provider.lastTest.model}`;
    }
    return provider.lastTest.ok
      ? `连接已验证：${provider.lastTest.testedAt}`
      : `最近验证失败：${provider.lastTest.message}`;
  });

  const workspaceSummary = computed(() => {
    if (!workspaceContext.value?.workspaceRoot) {
      return "工作区准备中…";
    }
    return workspaceContext.value.workspaceRoot;
  });

  const workspacePolicySummary = computed(() => {
    if (!workspaceContext.value?.scopeLabel) {
      return "仅允许在默认工作区内执行本地 Agent 操作";
    }
    return `本地 Agent 操作范围：${workspaceContext.value.scopeLabel}`;
  });

  const personaSummary = computed(() => {
    const persona = settingsStore.settings.desktopAgent.personaName.trim();
    return persona || "MyZ Desktop Agent";
  });

  const assistantEnabled = computed(() =>
    Boolean(settingsStore.settings.aiAssistantEnabled),
  );

  const assistantTargetError = computed(() => {
    if (!assistantEnabled.value) {
      return "";
    }
    try {
      resolveAgentTarget(
        settingsStore.settings as unknown as AIAssistantSettings,
        "conversation",
      );
      return "";
    } catch (error) {
      return (error as Error).message;
    }
  });

  const canAttachImages = computed(() => {
    if (!assistantEnabled.value || assistantTargetError.value) {
      return false;
    }
    try {
      const target = resolveAgentTarget(
        settingsStore.settings as unknown as AIAssistantSettings,
        "conversation",
      );
      return Boolean(target.model.capabilities.vision);
    } catch {
      return false;
    }
  });

  const hasActiveStream = computed(() => Boolean(activeStream.id));

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

  function updateConversationList(next: ConversationInfo) {
    const list = conversations.value.slice();
    const index = list.findIndex((item) => item.id === next.id);
    if (index >= 0) {
      list[index] = next;
    } else {
      list.unshift(next);
    }
    list.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    conversations.value = list;
  }

  async function persistActiveConversation(next: ConversationInfo) {
    const saved = await desktopChatHost.saveConversation(next);
    activeConversation.value = saved;
    updateConversationList(saved);
    if (saved.id) {
      conversationId.value = saved.id;
      await desktopChatHost.setActiveConversationId(saved.id);
    }
    return saved;
  }

  async function persistMessages(nextMessages: Message[]) {
    if (!conversationId.value) {
      return;
    }
    await desktopChatHost.replaceMessages(conversationId.value, nextMessages);
  }

  async function appendMessage(nextMessage: Message) {
    messages.value = [...messages.value, nextMessage];
    await persistMessages(messages.value);
  }

  async function loadConversations() {
    isHistoryLoading.value = true;
    try {
      conversations.value = await desktopChatHost.listConversations();
    } finally {
      isHistoryLoading.value = false;
    }
  }

  async function createNewConversation() {
    const now = new Date().toISOString();
    const conversation: ConversationInfo = {
      id: createId("conv"),
      title: "",
      url: "",
      createdAt: now,
      updatedAt: now,
      sendContextEnabled: false,
      metadata: {
        pageTitle: "",
        titleGenerated: false,
      },
    };
    messages.value = [];
    resetAttachments();
    resetActiveStream();
    await persistActiveConversation(conversation);
  }

  async function loadConversation(nextConversationId: string) {
    const [conversation, nextMessages] = await Promise.all([
      desktopChatHost.getConversation(nextConversationId),
      desktopChatHost.getMessages(nextConversationId),
    ]);
    if (!conversation) {
      return false;
    }
    conversationId.value = conversation.id;
    activeConversation.value = conversation;
    messages.value = nextMessages;
    resetAttachments();
    resetActiveStream();
    error.value = "";
    userInput.value = "";
    await desktopChatHost.setActiveConversationId(conversation.id);
    return true;
  }

  async function deleteConversationById(targetConversationId: string) {
    const previousList = conversations.value.slice();
    const index = previousList.findIndex(
      (item) => item.id === targetConversationId,
    );
    await desktopChatHost.deleteConversation(targetConversationId);
    conversations.value = previousList.filter(
      (item) => item.id !== targetConversationId,
    );

    if (conversationId.value !== targetConversationId) {
      return;
    }

    const fallback =
      conversations.value[index] ||
      conversations.value[index - 1] ||
      conversations.value[0] ||
      null;

    if (fallback) {
      await loadConversation(fallback.id);
      return;
    }

    conversationId.value = null;
    activeConversation.value = null;
    messages.value = [];
    await desktopChatHost.setActiveConversationId(null);
  }

  async function addImageFiles(files: FileList | null | undefined) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    if (!canAttachImages.value) {
      error.value = "当前模型不支持 Vision，无法添加图片";
      return;
    }

    const nextAttachments: ImageAttachment[] = [];
    for (const file of list) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(file);
      });
      if (!dataUrl.startsWith("data:")) continue;
      nextAttachments.push({
        type: "image",
        dataUrl,
        mimeType: file.type,
        name: file.name,
      });
    }

    if (nextAttachments.length) {
      attachments.value = [...attachments.value, ...nextAttachments];
    }
  }

  function removeAttachment(index: number) {
    attachments.value = attachments.value.filter(
      (_, itemIndex) => itemIndex !== index,
    );
  }

  async function sendUserMessage(content: string) {
    const trimmed = String(content || "").trim();
    if ((!trimmed && attachments.value.length === 0) || isLoading.value) {
      return;
    }
    if (!assistantEnabled.value) {
      error.value = "智能助理未启用，请先在设置中开启";
      return;
    }
    if (assistantTargetError.value) {
      error.value = `聊天模型未就绪：${assistantTargetError.value}`;
      return;
    }

    if (!conversationId.value) {
      await createNewConversation();
    }
    if (!conversationId.value || !activeConversation.value) {
      error.value = "创建对话失败";
      return;
    }

    if (attachments.value.length > 0 && !canAttachImages.value) {
      error.value = "当前模型不支持图片输入";
      return;
    }

    const uiStore = useChatUIStore();
    error.value = "";
    isLoading.value = true;

    try {
      const shouldCompress = Boolean(
        settingsStore.settings.aiAgents.conversation.compressImages,
      );
      const preparedAttachments = await Promise.all(
        attachments.value.map((item) =>
          maybeCompressImage(item, shouldCompress),
        ),
      );
      const userMessage: Message = {
        id: createId("user"),
        conversationId: conversationId.value,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
        metadata: preparedAttachments.length
          ? { attachments: cloneAttachments(preparedAttachments) }
          : {},
      };

      messages.value = [...messages.value, userMessage];
      userInput.value = "";
      resetAttachments();

      const updatedConversation: ConversationInfo = {
        ...activeConversation.value,
        title:
          activeConversation.value.title?.trim() ||
          deriveConversationTitle(trimmed),
        updatedAt: new Date().toISOString(),
        metadata: {
          ...(activeConversation.value.metadata || {}),
          titleGenerated: false,
        },
      };
      await persistActiveConversation(updatedConversation);
      await persistMessages(messages.value);

      activeStream.id = createId("assistant");
      activeStream.content = "";
      activeStream.reasoning = "";
      activeStream.timestamp = new Date().toISOString();
      activeStream.metadata = {
        streaming: true,
      };
      uiStore.scrollToBottom();

      const result = await streamDesktopConversation({
        settings: settingsStore.settings,
        conversationId: conversationId.value,
        transcript: messages.value,
        workspaceContext: workspaceContext.value,
        onToolCallMessage: async (message) => {
          await appendMessage(message);
          uiStore.scrollToBottom();
        },
        onToolResultMessage: async (message) => {
          await appendMessage(message);
          uiStore.scrollToBottom();
        },
        onStreamDelta: (delta) => {
          activeStream.content = delta.content;
          activeStream.reasoning = delta.reasoning;
          uiStore.scrollToBottom();
        },
      });

      const assistantMessage: Message = {
        id: activeStream.id || createId("assistant"),
        conversationId: conversationId.value,
        role: "assistant",
        content: result.content,
        timestamp: result.timestamp,
        reasoning_content: result.reasoning || undefined,
        metadata: {
          model: result.model,
          reasoning: result.reasoning || undefined,
          usage: result.usage,
          contextWindow: result.contextWindow,
          requestDurationMs: result.requestDurationMs,
        },
      };

      resetActiveStream();
      await appendMessage(assistantMessage);
      await persistActiveConversation({
        ...(activeConversation.value as ConversationInfo),
        updatedAt: new Date().toISOString(),
      });
      uiStore.scrollToBottom();
    } catch (caughtError) {
      resetActiveStream();
      error.value = `发送失败: ${(caughtError as Error).message}`;
    } finally {
      isLoading.value = false;
    }
  }

  async function initialize() {
    if (initialized.value) return;
    initialized.value = true;
    const [_, nextWorkspaceContext] = await Promise.all([
      settingsStore.loadSettings(),
      desktopChatHost.getWorkspaceContext(),
    ]);
    workspaceContext.value = nextWorkspaceContext;
    await loadConversations();
    const activeId = await desktopChatHost.getActiveConversationId();
    if (activeId && (await loadConversation(activeId))) {
      return;
    }
    if (conversations.value[0]) {
      await loadConversation(conversations.value[0].id);
    }
  }

  function cleanup() {
    initialized.value = false;
    resetAttachments();
    resetActiveStream();
    isLoading.value = false;
    error.value = "";
    workspaceContext.value = null;
  }

  return {
    conversationId,
    activeConversation,
    conversations,
    messages,
    visibleMessages,
    attachments,
    isLoading,
    isHistoryLoading,
    error,
    userInput,
    assistantEnabled,
    assistantTargetError,
    canAttachImages,
    activeStream,
    hasActiveStream,
    conversationTitle,
    conversationTargetSummary,
    conversationConnectionSummary,
    workspaceContext,
    workspaceSummary,
    workspacePolicySummary,
    personaSummary,
    loadConversations,
    createNewConversation,
    loadConversation,
    deleteConversationById,
    addImageFiles,
    removeAttachment,
    resetAttachments,
    sendUserMessage,
    initialize,
    cleanup,
  };
});
