import { ChatInputComposerBase } from "@myz/dashboard-chat-ui"
import { computed, defineComponent, ref } from "vue"
import { useChatStore } from "../../stores/chat"
import { useChatUIStore } from "../../stores/chatUi"

export default defineComponent({
  name: "DesktopChatInputComposer",
  setup() {
    const chatStore = useChatStore()
    const uiStore = useChatUIStore()
    const fileInputRef = ref<HTMLInputElement | null>(null)
    const isFocused = ref(false)
    const textareaRef = ref<HTMLTextAreaElement | null>(null)

    const isAssistantUnavailable = computed(
      () => !chatStore.assistantEnabled || Boolean(chatStore.assistantTargetError),
    )

    async function handleFilesChanged(event: Event) {
      const target = event.target as HTMLInputElement
      await chatStore.addImageFiles(target.files)
      target.value = ""
    }

    async function handleKeydown(event: KeyboardEvent) {
      if (isAssistantUnavailable.value) {
        event.preventDefault()
        return
      }
      if (uiStore.isComposing) {
        return
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        await chatStore.sendUserMessage(chatStore.userInput)
      }
    }

    async function handleSend() {
      if (isAssistantUnavailable.value) return
      await chatStore.sendUserMessage(chatStore.userInput)
      textareaRef.value?.focus()
    }

    return () => (
      <ChatInputComposerBase
        attachments={chatStore.attachments}
        userInput={chatStore.userInput}
        placeholder="请输入您的消息…"
        isFocused={isFocused.value}
        disabled={chatStore.isLoading || isAssistantUnavailable.value}
        canAttachImages={chatStore.canAttachImages}
        error={chatStore.error || ""}
        sendDisabled={
          isAssistantUnavailable.value ||
          (!chatStore.userInput.trim() && chatStore.attachments.length === 0) ||
          chatStore.isLoading
        }
        setTextareaRef={(element) => {
          textareaRef.value = element
        }}
        setFileInputRef={(element) => {
          fileInputRef.value = element
        }}
        onInput={(event) => {
          chatStore.userInput = (event.target as HTMLTextAreaElement).value
        }}
        onKeydown={handleKeydown}
        onFocus={() => {
          isFocused.value = true
        }}
        onBlur={() => {
          isFocused.value = false
        }}
        onCompositionStart={() => uiStore.setComposing(true)}
        onCompositionEnd={() => uiStore.setComposing(false)}
        onPickImages={() => fileInputRef.value?.click()}
        onFilesChanged={handleFilesChanged}
        onRemoveAttachment={(index) => chatStore.removeAttachment(index)}
        onPreviewAttachment={(attachment) =>
          uiStore.openImagePreview({
            dataUrl: attachment.dataUrl,
            title: attachment.name || "图片预览",
          })
        }
        onSend={handleSend}
      />
    )
  },
})
