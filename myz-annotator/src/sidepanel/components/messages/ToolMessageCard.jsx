import { defineComponent } from "vue";

function getToolPreviewText(content) {
  if (!content) return "（无输出，点击查看详情）";
  const singleLine = content.replace(/\s+/g, " ").trim();
  if (!singleLine) return "（无输出，点击查看详情）";
  if (singleLine.length <= 80) {
    return singleLine;
  }
  return singleLine.slice(0, 77) + "...";
}

export default defineComponent({
  name: "ToolMessageCard",
  props: {
    message: {
      type: Object,
      required: true,
    },
    onView: {
      type: Function,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <div class="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div class="flex flex-1 items-center gap-2 text-sm">
          <span class="text-lg">🔧</span>
          <div class="flex flex-col">
            <span class="font-semibold">
              {props.message.metadata?.toolName || "工具响应"}
            </span>
            <span class="text-xs text-slate-500 dark:text-slate-400">
              {getToolPreviewText(props.message.content)}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-xs text-slate-400">
            {new Date(props.message.timestamp).toLocaleTimeString()}
          </span>
          <button
            class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
            onClick={() => props.onView(props.message)}
          >
            查看详情
          </button>
        </div>
      </div>
    );
  },
});
