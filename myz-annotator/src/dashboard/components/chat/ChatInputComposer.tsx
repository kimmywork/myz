import { ChatInputComposerBase } from "@myz/dashboard-chat-ui";
import { computed, defineComponent, ref } from "vue";
import { useChatStore } from "@/dashboard/stores/chat.js";
import { useChatUIStore } from "@/dashboard/stores/chatUi.js";
import { useSkillMentions } from "@/shared/useSkillMentions.js";

export default defineComponent({
  name: "DashboardChatInputComposer",
  setup() {
    const chatStore = useChatStore();
    const uiStore = useChatUIStore();
    const fileInputRef = ref<HTMLInputElement | null>(null);
    const textareaRef = ref<HTMLTextAreaElement | null>(null);
    const isFocused = ref(false);
    const isAssistantDisabled = computed(() => !chatStore.assistantEnabled);
    const {
      mentionOpen,
      filteredSkills,
      closeMentions,
      applyMention,
      handleInput,
      handleMentionKeydown,
    } = useSkillMentions({
      textareaRef,
      getValue: () => chatStore.userInput || "",
      setValue: (value) => {
        chatStore.userInput = value;
      },
    });

    const handlePickImages = () => {
      if (isAssistantDisabled.value) return;
      fileInputRef.value?.click();
    };

    const handleFilesChanged = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      await chatStore.addImageFiles(target.files);
      target.value = "";
    };

    const handleKeydown = async (event: KeyboardEvent) => {
      if (isAssistantDisabled.value) {
        event.preventDefault();
        return;
      }
      if (uiStore.isComposing) {
        return;
      }
      if (await handleMentionKeydown(event)) {
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        closeMentions();
        await chatStore.sendUserMessage(chatStore.userInput);
      }
    };

    const handleSend = async () => {
      if (isAssistantDisabled.value) return;
      closeMentions();
      await chatStore.sendUserMessage(chatStore.userInput);
    };

    return () => (
      <ChatInputComposerBase
        attachments={chatStore.attachments}
        userInput={chatStore.userInput}
        placeholder="请输入您的消息..."
        isFocused={isFocused.value}
        disabled={chatStore.isLoading || isAssistantDisabled.value}
        canAttachImages={chatStore.canAttachImages}
        error={chatStore.error || ""}
        sendDisabled={
          isAssistantDisabled.value ||
          (!chatStore.userInput?.trim() &&
            chatStore.attachments.length === 0) ||
          chatStore.isLoading
        }
        setTextareaRef={(element) => {
          textareaRef.value = element;
        }}
        setFileInputRef={(element) => {
          fileInputRef.value = element;
        }}
        onInput={handleInput}
        onKeydown={handleKeydown}
        onFocus={() => {
          isFocused.value = true;
        }}
        onBlur={() => {
          isFocused.value = false;
        }}
        onCompositionStart={() => uiStore.setComposing(true)}
        onCompositionEnd={() => uiStore.setComposing(false)}
        onPickImages={handlePickImages}
        onFilesChanged={handleFilesChanged}
        onRemoveAttachment={(index) => chatStore.removeAttachment(index)}
        onPreviewAttachment={(attachment) =>
          uiStore.openImagePreview({
            dataUrl: attachment.dataUrl,
            title: attachment.name || "图片预览",
          })
        }
        onSend={handleSend}
        renderOverlay={() =>
          mentionOpen.value && filteredSkills.value.length > 0 ? (
            <div class="absolute left-2 right-2 top-full z-10 mt-2 max-h-40 overflow-auto rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {filteredSkills.value.map((skill) => (
                <button
                  type="button"
                  class="flex w-full items-start justify-between gap-2 rounded-lg px-2 py-1 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => applyMention(skill.name)}
                >
                  <span class="font-medium">@{skill.name}</span>
                  <span class="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {skill.description}
                  </span>
                </button>
              ))}
            </div>
          ) : null
        }
      />
    );
  },
});
