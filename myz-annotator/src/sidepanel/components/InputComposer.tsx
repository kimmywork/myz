import { computed, defineComponent, nextTick, onMounted, ref } from "vue";
import { useChatStore } from "../stores/chat.js";
import { useUIStore } from "../stores/ui.js";
import { sendMessage } from "@/shared/messaging.js";
import type { SkillMetadata } from "@/background/ai/skills/types.js";

export default defineComponent({
  name: "InputComposer",
  setup() {
    const chatStore = useChatStore();
    const uiStore = useUIStore();
    const fileInputRef = ref<HTMLInputElement | null>(null);
    const textareaRef = ref<HTMLTextAreaElement | null>(null);
    const isFocused = ref(false);
    const skillList = ref<SkillMetadata[]>([]);
    const mentionQuery = ref("");
    const mentionStart = ref(0);
    const mentionEnd = ref(0);
    const mentionOpen = ref(false);

    const filteredSkills = computed(() => {
      const query = mentionQuery.value.trim();
      const enabled = skillList.value.filter((skill) => skill.enabled);
      if (!query) return enabled.slice(0, 6);
      return enabled
        .filter((skill) => skill.name.startsWith(query))
        .slice(0, 6);
    });

    const refreshSkills = async () => {
      try {
        const result = await sendMessage("myz:listSkills");
        skillList.value = Array.isArray(result) ? result : [];
      } catch {
        skillList.value = [];
      }
    };

    const closeMentions = () => {
      mentionOpen.value = false;
      mentionQuery.value = "";
    };

    const applyMention = async (name: string) => {
      if (!textareaRef.value) return;
      const value = chatStore.userInput || "";
      const before = value.slice(0, mentionStart.value);
      const after = value.slice(mentionEnd.value);
      const nextValue = `${before}@${name} ${after}`;
      chatStore.userInput = nextValue;
      closeMentions();
      await nextTick();
      const cursor = before.length + name.length + 2;
      textareaRef.value.selectionStart = cursor;
      textareaRef.value.selectionEnd = cursor;
      textareaRef.value.focus();
    };

    const handleInput = (event: Event) => {
      const target = event.target as HTMLTextAreaElement;
      chatStore.userInput = target.value;
      const caret = target.selectionStart ?? target.value.length;
      const before = target.value.slice(0, caret);
      const match = /(?:^|\s)@([a-z0-9-]*)$/.exec(before);
      if (match) {
        mentionQuery.value = match[1] || "";
        mentionEnd.value = caret;
        mentionStart.value = caret - (match[1]?.length || 0) - 1;
        mentionOpen.value = true;
        if (skillList.value.length === 0) {
          void refreshSkills();
        }
      } else {
        closeMentions();
      }
    };

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
      if (mentionOpen.value && filteredSkills.value.length) {
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          await applyMention(filteredSkills.value[0].name);
          return;
        }
        if (e.key === "Escape") {
          closeMentions();
          return;
        }
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

    onMounted(() => {
      void refreshSkills();
    });

    return () => (
      <div class="border-t border-slate-200/80 bg-white/80 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-900/80">
        {chatStore.draftContext.present && (
          <div class="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <div class="flex items-center justify-between gap-2">
              <label class="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                  checked={chatStore.draftContext.enabled}
                  onChange={(e) => {
                    chatStore.draftContext.enabled = (e.target as HTMLInputElement).checked;
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

            {chatStore.draftContext.text && (
              <div class="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {chatStore.draftContext.text}
              </div>
            )}

            {chatStore.draftContext.attachments.length > 0 && (
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
            )}
          </div>
        )}

        {chatStore.attachments.length > 0 && (
          <div class="mb-3 flex flex-wrap gap-2">
            {chatStore.attachments.map((item, index) => (
              <div class="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <img
                  src={item.dataUrl}
                  class="h-full w-full object-cover"
                  alt={item.name || `image-${index + 1}`}
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
                    chatStore.removeAttachment(index);
                  }}
                  title="移除图片"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div class="relative">
          <textarea
            ref={textareaRef}
            class={[
              "w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500",
              isFocused.value ? "min-h-[120px]" : "min-h-11",
              "overflow-auto",
            ].join(" ")}
            value={chatStore.userInput}
            placeholder="请输入您的消息..."
            rows={isFocused.value ? 3 : 1}
            disabled={chatStore.isLoading}
            onInput={handleInput}
            onKeydown={handleKeydown}
            onFocus={() => {
              isFocused.value = true;
            }}
            onBlur={() => {
              isFocused.value = false;
            }}
            onCompositionstart={() => uiStore.setComposing(true)}
            onCompositionend={() => uiStore.setComposing(false)}
          />
          {mentionOpen.value && filteredSkills.value.length > 0 && (
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
          )}
        </div>
        <div class="mt-3 flex items-center justify-between text-xs text-slate-500">
          <div class="flex items-center gap-2">
            {chatStore.canAttachImages && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  class="hidden"
                  onChange={handleFilesChanged}
                />
                <button
                  class="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  onClick={handlePickImages}
                  disabled={chatStore.isLoading}
                >
                  添加图片
                </button>
              </>
            )}
            <label class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                checked={chatStore.sendContext}
                disabled={chatStore.isLoading}
                onChange={(e) => chatStore.toggleContext(e as any)}
              />
              页面上下文
            </label>
            {chatStore.error && <span class="text-rose-500">{chatStore.error}</span>}
          </div>
          <button
            class="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
            onClick={handleSend}
            disabled={
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
          >
            发送
          </button>
        </div>
      </div>
    );
  },
});
