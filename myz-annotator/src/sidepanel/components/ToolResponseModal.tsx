import { defineComponent } from "vue";
import { ToolInvocationDetails } from "./ConversationList";

export interface ToolResponseViewerState {
    visible: boolean;
    title: string;
    toolName: string;
    timestamp?: string;
    args?: string;
    content?: string;
    invocationDetails: ToolInvocationDetails[];
  }

interface ToolResponseModalProps {
  viewer: ToolResponseViewerState;
  onClose: () => void;
};

export default defineComponent({
  name: "ToolResponseModal",
  setup(props: ToolResponseModalProps) {
    return () =>
      props.viewer.visible ? (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur"
          onClick={props.onClose}
        >
          <div
            class="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <header class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <div class="text-lg font-semibold text-slate-900 dark:text-white">
                  🔧 {props.viewer.toolName}
                </div>
                {props.viewer.timestamp && (
                  <div class="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(props.viewer.timestamp).toLocaleString()}
                  </div>
                )}
              </div>
              <button
                class="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:text-slate-300"
                onClick={props.onClose}
              >
                ✕
              </button>
            </header>
            <div class="mt-4 space-y-4 overflow-y-auto">
              {props.viewer.invocationDetails.length > 0 ? (
                props.viewer.invocationDetails.map((detail) => (
                  <div
                    key={detail.id}
                    class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <div class="text-sm font-semibold">{detail.name}</div>
                    <pre class="mt-2 whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                      {detail.arguments}
                    </pre>
                  </div>
                ))
              ) : (
                <>
                  {props.viewer.args && (
                    <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <div class="text-sm font-semibold">调用参数</div>
                      <pre class="mt-2 whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                        {props.viewer.args}
                      </pre>
                    </div>
                  )}
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <div class="text-sm font-semibold">工具输出</div>
                    <pre class="mt-2 whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                      {props.viewer.content || "（无内容）"}
                    </pre>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null;
  },
});
