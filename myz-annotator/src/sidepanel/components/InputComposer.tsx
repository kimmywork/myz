import { defineComponent } from "vue";

interface InputComposerProps {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  onInput?: (event: Event) => void;
  onKeydown?: (event: KeyboardEvent) => void;
  onCompositionstart?: (event: CompositionEvent) => void;
  onCompositionend?: (event: CompositionEvent) => void;
  onSend?: () => void;
}

export default defineComponent({
  name: "InputComposer",
  props: {
    value: {
      type: String,
      required: false,
      default: "",
    },
    placeholder: {
      type: String,
      required: false,
      default: "请输入您的消息...",
    },
    disabled: {
      type: Boolean,
      required: false,
      default: false,
    },
    error: {
      type: String,
      required: false,
      default: "",
    },
    onInput: {
      type: Function,
      required: true,
    },
    onKeydown: {
      type: Function,
      required: true,
    },
    onCompositionstart: {
      type: Function,
      required: true,
    },
    onCompositionend: {
      type: Function,
      required: true,
    },
    onSend: {
      type: Function,
      required: true,
    },
  },
  setup(props: InputComposerProps) {
    return () => (
      <div class="border-t border-slate-200/80 bg-white/80 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-900/80">
        <textarea
          class="min-h-[120px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          value={props.value}
          placeholder={props.placeholder}
          rows={3}
          disabled={props.disabled}
          onInput={(e) => props.onInput?.(e)}
          onKeydown={(e) => props.onKeydown?.(e)}
          onCompositionstart={(e) => props.onCompositionstart?.(e)}
          onCompositionend={(e) => props.onCompositionend?.(e)}
        />
        <div class="mt-3 flex items-center justify-between text-xs text-slate-500">
          {props.error && <span class="text-rose-500">{props.error}</span>}
          <button
            class="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
            onClick={() => props.onSend?.()}
            disabled={!props.value?.trim() || props.disabled}
          >
            发送
          </button>
        </div>
      </div>
    );
  },
});
