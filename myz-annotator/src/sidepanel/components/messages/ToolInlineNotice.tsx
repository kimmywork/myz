import { defineComponent } from "vue";

export interface ToolInlineNoticeProps {
  text?: string;
  timestamp?: string;
  onDetails?: () => void;
  showButton?: boolean;
  size?: "sm" | "lg";
}

export default defineComponent({
  name: "ToolInlineNotice",
  setup(props: ToolInlineNoticeProps) {
    const base =
      "flex w-full flex-wrap items-center gap-2 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/70 px-3 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-200";

    return () => {
      const sizeClass =
        props.size === "lg" ? "py-3 text-sm" : "py-2 text-xs font-medium";
      return (
        <div class={[base, sizeClass].join(" ")}>
          <span class="flex-1">{props.text}</span>
          {props.timestamp && (
            <span class="text-[11px] text-indigo-400 dark:text-indigo-300/70">
              {props.timestamp}
            </span>
          )}
          {props.showButton && props.onDetails && (
            <button
              class="ml-auto text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-200"
              onClick={props.onDetails}
            >
              查看详情
            </button>
          )}
        </div>
      );
    };
  },
});
