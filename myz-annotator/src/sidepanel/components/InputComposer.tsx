import { ChatInputComposerBase } from "@myz/dashboard-chat-ui";
import { defineComponent, ref } from "vue";
import { useChatStore } from "../stores/chat.js";
import { useUIStore } from "../stores/ui.js";
import { useSkillMentions } from "@/shared/useSkillMentions.js";

export default defineComponent({
  name: "InputComposer",
  setup() {
    const chatStore = useChatStore();
    const uiStore = useUIStore();
    const fileInputRef = ref<HTMLInputElement | null>(null);
    const textareaRef = ref<HTMLTextAreaElement | null>(null);
    const isFocused = ref(false);
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
      fileInputRef.value?.click();
    };

    const handleFilesChanged = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      await chatStore.addImageFiles(target.files);
      target.value = "";
    };

    const handleKeydown = async (e: KeyboardEvent) => {
      if (uiStore.isComposing) {
        return;
      }
      if (await handleMentionKeydown(e)) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        closeMentions();
        await chatStore.sendMessage(chatStore.userInput);
      }
    };

    const handleSend = async () => {
      closeMentions();
      await chatStore.sendMessage(chatStore.userInput);
    };

    return () => (
      <ChatInputComposerBase
        attachments={chatStore.attachments}
        userInput={chatStore.userInput}
        placeholder="请输入您的消息..."
        isFocused={isFocused.value}
        disabled={chatStore.isLoading}
        canAttachImages={chatStore.canAttachImages}
        error={chatStore.error || ""}
        sendDisabled={
          (!chatStore.userInput?.trim() &&
            chatStore.attachments.length === 0 &&
            !(
              chatStore.draftContext.present &&
              chatStore.draftContext.enabled &&
              ((chatStore.draftContext.text || "").trim() ||
                chatStore.draftContext.attachments.length > 0)
            )) ||
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
        renderBefore={() =>
          chatStore.draftContext.present ? (
            <div class="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <div class="flex items-center justify-between gap-2">
                <label class="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                    checked={chatStore.draftContext.enabled}
                    onChange={(e) => {
                      chatStore.draftContext.enabled = (
                        e.target as HTMLInputElement
                      ).checked;
                    }}
                  />
                  <span class="font-medium">选中内容上下文</span>
                </label>
                <button
                  class="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  onClick={() => chatStore.clearDraftContext()}
                  disabled={chatStore.isLoading}
                >
                  清空
                </button>
              </div>

              {chatStore.draftContext.text ? (
                <div class="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {chatStore.draftContext.text}
                </div>
              ) : null}

              {chatStore.draftContext.attachments.length > 0 ? (
                <div class="mt-2 flex flex-wrap gap-2">
                  {chatStore.draftContext.attachments.map((item, index) => (
                    <div class="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                      <img
                        src={item.dataUrl}
                        class="h-full w-full object-cover"
                        alt={item.name || `context-image-${index + 1}`}
                        onClick={() =>
                          uiStore.openImagePreview({
                            dataUrl: item.dataUrl,
                            title: item.name || "图片预览",
                          })
                        }
                      />
                      <button
                        class="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-xs text-white hover:bg-slate-900"
                        onClick={(e) => {
                          e.stopPropagation();
                          chatStore.removeDraftAttachment(index);
                        }}
                        title="移除图片"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null
        }
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
        renderLeadingControls={() => (
          <>
            <label class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                checked={chatStore.sendContext}
                disabled={chatStore.isLoading}
                onChange={(event) => chatStore.toggleContext(event)}
              />
              页面上下文
            </label>
          </>
        )}
      />
    );
  },
});
