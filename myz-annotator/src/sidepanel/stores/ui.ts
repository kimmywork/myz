import { defineStore } from "pinia";
import { reactive, ref, nextTick } from "vue";
import { ToolInvocationDetails, Message } from "@/background/ai/types.js";
import { sendMessage } from "@/shared/messaging.js";
import { useChatStore } from "./chat.js";
import { usePageStore } from "./page.js";

export interface SaveModalState {
  visible: boolean;
  aiResponse: string;
  messageId: string | null;
}

export interface ToolResponseViewerState {
  visible: boolean;
  title: string;
  content: string;
  toolName: string;
  timestamp: string;
  args: string;
  invocationDetails: ToolInvocationDetails[];
}

export const useUIStore = defineStore("ui", () => {
  const view = ref<"chat" | "history" | "related">("chat");
  const isComposing = ref(false);
  const isSavingHighlight = ref(false);
  const messageListRef = ref<Element | null>(null);

  const saveModal = reactive<SaveModalState>({
    visible: false,
    aiResponse: "",
    messageId: null,
  });

  const toolResponseViewer = reactive<ToolResponseViewerState>({
    visible: false,
    title: "",
    content: "",
    toolName: "",
    timestamp: "",
    args: "",
    invocationDetails: [],
  });

  function setView(newView: "chat" | "history" | "related") {
    view.value = newView;
  }

  function setComposing(value: boolean) {
    isComposing.value = value;
  }

  function scrollToBottom() {
    nextTick(() => {
      if (messageListRef.value) {
        messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
      }
    });
  }

  function openSaveModal(message: Message) {
    saveModal.aiResponse = message.content;
    saveModal.messageId = message.id;
    saveModal.visible = true;
  }

  function closeSaveModal() {
    saveModal.visible = false;
    saveModal.aiResponse = "";
    saveModal.messageId = null;
  }

  async function saveHighlight(data: { note: string; tags: string[] }) {
    const chatStore = useChatStore();
    const pageStore = usePageStore();
    
    const messageId = saveModal.messageId;
    const message = chatStore.messages.find((m) => m.id === messageId);
    if (!message) return;

    isSavingHighlight.value = true;

    try {
      await sendMessage("myz:saveAiGeneratedHighlight", {
        url: pageStore.currentUrl,
        title: pageStore.pageTitle,
        text: message.content,
        note: data.note,
        tags: data.tags,
        conversationId: chatStore.conversationId,
        model: message.metadata?.model || "unknown",
        action: "custom",
        messageId: message.id,
        timestamp: message.timestamp,
      });

      message.metadata = {
        ...message.metadata,
        savedAsHighlight: true,
      };

      chatStore.error = "✅ 已保存为摘录";
      setTimeout(() => {
        chatStore.error = "";
      }, 3000);

      closeSaveModal();
    } catch (e) {
      console.error("Failed to save highlight:", e);
      chatStore.error = "保存失败: " + (e as Error).message;
    } finally {
      isSavingHighlight.value = false;
    }
  }

  function formatArgumentsForDisplay(value: string) {
    if (!value) return "";
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  function openToolResponse(message: Message) {
    toolResponseViewer.visible = true;
    toolResponseViewer.title = message.metadata?.toolName || "工具响应详情";
    toolResponseViewer.content = message.content || "";
    toolResponseViewer.toolName = message.metadata?.toolName || "工具响应";
    toolResponseViewer.timestamp = message.timestamp || "";
    toolResponseViewer.args = formatArgumentsForDisplay(
      message.metadata?.toolArgs,
    );
    toolResponseViewer.invocationDetails = [];
  }

  function closeToolResponse() {
    toolResponseViewer.visible = false;
    toolResponseViewer.title = "";
    toolResponseViewer.content = "";
    toolResponseViewer.toolName = "";
    toolResponseViewer.timestamp = "";
    toolResponseViewer.args = "";
    toolResponseViewer.invocationDetails = [];
  }

  function openToolInvocationDetails(message: Message) {
    if (!message.metadata?.toolCallDetails?.length) return;
    const details = message.metadata?.toolCallDetails?.map(
      (detail, index) => ({
        id: detail.id || `tool-${index + 1}`,
        name: detail.name || `工具 ${index + 1}`,
        arguments:
          formatArgumentsForDisplay(detail.arguments) || "（无参数）",
      }),
    );
    toolResponseViewer.visible = true;
    toolResponseViewer.toolName = "工具调用参数";
    toolResponseViewer.title = "工具调用参数";
    toolResponseViewer.timestamp = message.timestamp || "";
    toolResponseViewer.content = "";
    toolResponseViewer.args = "";
    toolResponseViewer.invocationDetails = details || [];
  }

  // Alias for compatibility if needed, or just use openToolResponse
  function openToolViewer(state: Partial<ToolResponseViewerState>) {
    Object.assign(toolResponseViewer, {
      visible: true,
      ...state,
    });
  }

  function closeToolViewer() {
    toolResponseViewer.visible = false;
  }

  return {
    view,
    isComposing,
    isSavingHighlight,
    saveModal,
    toolResponseViewer,
    messageListRef,
    setView,
    setComposing,
    scrollToBottom,
    openSaveModal,
    closeSaveModal,
    saveHighlight,
    openToolResponse,
    closeToolResponse,
    openToolInvocationDetails,
    openToolViewer,
    closeToolViewer,
  };
});
