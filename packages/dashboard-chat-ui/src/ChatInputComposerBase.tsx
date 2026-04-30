import { defineComponent } from "vue"
import type { PropType } from "vue"
import type { ChatAttachmentLike } from "./types"

export default defineComponent({
  name: "ChatInputComposerBase",
  props: {
    attachments: {
      type: Array as PropType<ChatAttachmentLike[]>,
      required: true,
    },
    userInput: {
      type: String,
      default: "",
    },
    placeholder: {
      type: String,
      default: "请输入您的消息...",
    },
    isFocused: {
      type: Boolean,
      default: false,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    canAttachImages: {
      type: Boolean,
      default: false,
    },
    error: {
      type: String,
      default: "",
    },
    renderBefore: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
    renderLeadingControls: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
    sendDisabled: {
      type: Boolean,
      default: false,
    },
    setTextareaRef: {
      type: Function as PropType<(element: HTMLTextAreaElement | null) => void>,
      required: false,
    },
    setFileInputRef: {
      type: Function as PropType<(element: HTMLInputElement | null) => void>,
      required: false,
    },
    onInput: {
      type: Function as PropType<(event: Event) => void>,
      required: true,
    },
    onKeydown: {
      type: Function as PropType<(event: KeyboardEvent) => void>,
      required: true,
    },
    onFocus: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onBlur: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onCompositionStart: {
      type: Function as PropType<() => void>,
      required: false,
    },
    onCompositionEnd: {
      type: Function as PropType<() => void>,
      required: false,
    },
    onPickImages: {
      type: Function as PropType<() => void>,
      required: false,
    },
    onFilesChanged: {
      type: Function as PropType<(event: Event) => void>,
      required: false,
    },
    onRemoveAttachment: {
      type: Function as PropType<(index: number) => void>,
      required: true,
    },
    onPreviewAttachment: {
      type: Function as PropType<(attachment: ChatAttachmentLike, index: number) => void>,
      required: true,
    },
    onSend: {
      type: Function as PropType<() => void>,
      required: true,
    },
    renderOverlay: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
    attachButtonLabel: {
      type: String,
      default: "添加图片",
    },
    sendButtonLabel: {
      type: String,
      default: "发送",
    },
  },
  setup(props) {
    return () => (
      <div class="border-t border-slate-200/80 bg-white/80 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-900/80">
        {props.renderBefore?.()}
        {props.attachments.length > 0 ? (
          <div class="mb-3 flex flex-wrap gap-2">
            {props.attachments.map((attachment, index) => (
              <div
                key={`${attachment.name || "image"}-${index}`}
                class="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
              >
                <img
                  src={attachment.dataUrl}
                  class="h-full w-full object-cover"
                  alt={attachment.name || `image-${index + 1}`}
                  onClick={() => props.onPreviewAttachment(attachment, index)}
                />
                <button
                  class="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-xs text-white hover:bg-slate-900"
                  onClick={(event) => {
                    event.stopPropagation()
                    props.onRemoveAttachment(index)
                  }}
                  title="移除图片"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div class="relative">
          <textarea
            ref={(element) =>
              props.setTextareaRef?.(element as HTMLTextAreaElement | null)
            }
            class={[
              "w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500",
              props.isFocused ? "min-h-[120px]" : "min-h-11",
              "overflow-auto",
            ].join(" ")}
            value={props.userInput}
            placeholder={props.placeholder}
            rows={props.isFocused ? 3 : 1}
            disabled={props.disabled}
            onInput={props.onInput}
            onKeydown={props.onKeydown}
            onFocus={props.onFocus}
            onBlur={props.onBlur}
            onCompositionstart={props.onCompositionStart}
            onCompositionend={props.onCompositionEnd}
          />
          {props.renderOverlay?.()}
        </div>

        <div class="mt-3 flex items-center justify-between text-xs text-slate-500">
          <div class="flex items-center gap-2">
            {props.renderLeadingControls?.()}
            {props.canAttachImages ? (
              <>
                <input
                  ref={(element) =>
                    props.setFileInputRef?.(element as HTMLInputElement | null)
                  }
                  type="file"
                  accept="image/*"
                  multiple
                  class="hidden"
                  onChange={props.onFilesChanged}
                  disabled={props.disabled}
                />
                <button
                  class="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  onClick={props.onPickImages}
                  disabled={props.disabled}
                >
                  {props.attachButtonLabel}
                </button>
              </>
            ) : null}
            {props.error ? <span class="text-rose-500">{props.error}</span> : null}
          </div>
          <button
            class="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
            onClick={props.onSend}
            disabled={props.sendDisabled}
          >
            {props.sendButtonLabel}
          </button>
        </div>
      </div>
    )
  },
})
