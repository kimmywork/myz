import { defineStore } from "pinia"
import { nextTick, reactive, ref } from "vue"
import type { Message } from "@myz/ai-core/types"
import { CONTENT_TYPES, RECORD_KINDS, type MyZRecord } from "@myz/shared"
import { ensureRecordSchemaVersion } from "@myz/shared"
import { desktopDashboardHost } from "../../host/desktop"
import { useHighlightsStore } from "./highlights"
import { useChatStore } from "./chat"

export interface SaveModalState {
  visible: boolean
  aiResponse: string
  messageId: string | null
}

export interface ToolResponseViewerState {
  visible: boolean
  title: string
  content: string
  toolName: string
  timestamp: string
  args: string
  invocationDetails: Array<{
    id: string
    name: string
    arguments: string
  }>
}

export interface ImagePreviewState {
  visible: boolean
  dataUrl: string
  title: string
}

function resolveRecordHostname(url: string) {
  try {
    return new URL(url).hostname || "local.desktop"
  } catch {
    return "local.desktop"
  }
}

export const useChatUIStore = defineStore("desktop-chat-ui", () => {
  const isComposing = ref(false)
  const isSavingHighlight = ref(false)
  const messageListRef = ref<Element | null>(null)

  const saveModal = reactive<SaveModalState>({
    visible: false,
    aiResponse: "",
    messageId: null,
  })

  const toolResponseViewer = reactive<ToolResponseViewerState>({
    visible: false,
    title: "",
    content: "",
    toolName: "",
    timestamp: "",
    args: "",
    invocationDetails: [],
  })

  const imagePreview = reactive<ImagePreviewState>({
    visible: false,
    dataUrl: "",
    title: "",
  })

  function setComposing(value: boolean) {
    isComposing.value = value
  }

  function scrollToBottom() {
    nextTick(() => {
      if (messageListRef.value) {
        messageListRef.value.scrollTop = messageListRef.value.scrollHeight
      }
    })
  }

  function openSaveModal(message: Message) {
    saveModal.aiResponse = message.content
    saveModal.messageId = message.id
    saveModal.visible = true
  }

  function closeSaveModal() {
    saveModal.visible = false
    saveModal.aiResponse = ""
    saveModal.messageId = null
  }

  async function saveHighlight(data: { note: string; tags: string[] }) {
    const chatStore = useChatStore()
    const highlightsStore = useHighlightsStore()
    const messageId = saveModal.messageId
    const message = chatStore.messages.find((item) => item.id === messageId)
    if (!message) return

    isSavingHighlight.value = true

    try {
      const conversation = chatStore.activeConversation
      const now = new Date().toISOString()
      const tags = Array.from(
        new Set(
          (data.tags.length ? data.tags : ["ai-generated"])
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      )
      const record = ensureRecordSchemaVersion({
        id: `ai-${crypto.randomUUID()}`,
        kind: RECORD_KINDS.AI_GENERATED,
        text: message.content,
        note: data.note || "",
        tags,
        contentType: CONTENT_TYPES.MARKDOWN,
        url:
          conversation?.url || `myz://desktop/chat/${chatStore.conversationId || "local"}`,
        sourceUrl:
          conversation?.url || `myz://desktop/chat/${chatStore.conversationId || "local"}`,
        title:
          conversation?.title?.trim() ||
          conversation?.metadata?.pageTitle?.toString().trim() ||
          "Desktop Chat",
        hostname: resolveRecordHostname(conversation?.url || ""),
        createdAt: now,
        updatedAt: now,
        conversationId: chatStore.conversationId || undefined,
        aiMetadata: {
          prompt: "",
          model: String(message.metadata?.model || ""),
          action: "custom",
        },
      } satisfies Partial<MyZRecord>) as MyZRecord

      await desktopDashboardHost.records.saveRecord(record)
      await highlightsStore.refreshHighlights()

      message.metadata = {
        ...message.metadata,
        savedAsHighlight: true,
      }

      chatStore.error = "✅ 已保存为摘录"
      window.setTimeout(() => {
        if (chatStore.error === "✅ 已保存为摘录") {
          chatStore.error = ""
        }
      }, 3000)
      closeSaveModal()
    } catch (error) {
      chatStore.error = `保存失败: ${(error as Error).message}`
    } finally {
      isSavingHighlight.value = false
    }
  }

  function formatArgumentsForDisplay(value: string) {
    if (!value) return ""
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }

  function openToolResponse(message: Message) {
    toolResponseViewer.visible = true
    const toolName =
      typeof message.metadata?.toolName === "string"
        ? message.metadata.toolName
        : "工具响应详情"
    toolResponseViewer.title = toolName
    toolResponseViewer.content = message.content || ""
    toolResponseViewer.toolName = toolName
    toolResponseViewer.timestamp = message.timestamp || ""
    toolResponseViewer.args = formatArgumentsForDisplay(
      typeof message.metadata?.toolArgs === "string" ? message.metadata.toolArgs : "",
    )
    toolResponseViewer.invocationDetails = []
  }

  function closeToolResponse() {
    toolResponseViewer.visible = false
    toolResponseViewer.title = ""
    toolResponseViewer.content = ""
    toolResponseViewer.toolName = ""
    toolResponseViewer.timestamp = ""
    toolResponseViewer.args = ""
    toolResponseViewer.invocationDetails = []
  }

  function openToolInvocationDetails(message: Message) {
    if (!Array.isArray(message.metadata?.toolCallDetails)) return
    toolResponseViewer.visible = true
    toolResponseViewer.toolName = "工具调用参数"
    toolResponseViewer.title = "工具调用参数"
    toolResponseViewer.timestamp = message.timestamp || ""
    toolResponseViewer.content = ""
    toolResponseViewer.args = ""
    toolResponseViewer.invocationDetails = message.metadata.toolCallDetails.map(
      (detail, index) => ({
        id: detail.id || `tool-${index + 1}`,
        name: detail.name || `工具 ${index + 1}`,
        arguments: formatArgumentsForDisplay(detail.arguments) || "（无参数）",
      }),
    )
  }

  function openImagePreview(payload: { dataUrl: string; title?: string }) {
    const dataUrl = typeof payload.dataUrl === "string" ? payload.dataUrl : ""
    if (!dataUrl) return
    imagePreview.visible = true
    imagePreview.dataUrl = dataUrl
    imagePreview.title = payload.title || "图片预览"
  }

  function closeImagePreview() {
    imagePreview.visible = false
    imagePreview.dataUrl = ""
    imagePreview.title = ""
  }

  return {
    isComposing,
    isSavingHighlight,
    messageListRef,
    saveModal,
    toolResponseViewer,
    imagePreview,
    setComposing,
    scrollToBottom,
    openSaveModal,
    closeSaveModal,
    saveHighlight,
    openToolResponse,
    closeToolResponse,
    openToolInvocationDetails,
    openImagePreview,
    closeImagePreview,
  }
})
