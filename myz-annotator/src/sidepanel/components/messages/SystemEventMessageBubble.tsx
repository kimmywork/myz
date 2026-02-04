import { defineComponent, computed } from "vue";
import type { Message } from "@/background/ai/types.js";

export default defineComponent({
  name: "SystemEventMessageBubble",
  props: {
    message: {
      type: Object as () => Message,
      required: true,
    },
  },
  setup(props) {
    const text = computed(() => (props.message?.content || "").trim() || "系统事件");
    const timestamp = computed(() =>
      props.message?.timestamp ? new Date(props.message.timestamp).toLocaleTimeString() : "",
    );

    return () => (
      <div class="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-dashed border-amber-300/70 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
        <span class="flex-1">{text.value}</span>
        {timestamp.value && (
          <span class="text-[11px] text-amber-500/80 dark:text-amber-200/70">
            {timestamp.value}
          </span>
        )}
      </div>
    );
  },
});
