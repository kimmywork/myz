import { defineComponent, PropType } from "vue";
import McpServerForm, { McpServerFormModel } from "./McpServerForm";

type McpServerConfig = {
  id: string;
  title?: string | null;
  enabled: boolean;
  prefix?: string | null;
  kind: string;
  command?: string | null;
  args: string[];
  running: boolean;
  env: Record<string, string>;
  headers: Record<string, string>;
};

type EditingDraft = {
  id: string;
  kind: string;
  title: string;
  prefix: string;
  enabled: boolean;
  command: string;
  args: string;
  env: string;
  headers: string;
};

export default defineComponent({
  name: "McpServerEditItem",
  props: {
    server: {
      type: Object as PropType<McpServerConfig>,
      required: true,
    },
    editing: {
      type: Boolean,
      required: true,
    },
    draft: {
      type: Object as PropType<EditingDraft | null>,
      default: null,
    },
    onStartEdit: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onSave: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onCancel: {
      type: Function as PropType<() => void>,
      required: true,
    },
  },
  setup(props) {
    return () => {
      const mcp = props.server;
      const draft = props.draft;
      const isEditing = props.editing && !!draft;
      const name = mcp.title ?? mcp.id;
      const isRunning = mcp.running;
      const prefixLabel = mcp.prefix ? mcp.prefix : "无";
      const commandLabel =
        mcp.command != null ? `${mcp.command} ${mcp.args.join(" ")}` : "N/A";
      const envEntries = Object.entries(mcp.env ?? {});

      if (isEditing && draft) {
        const formModel = draft as unknown as McpServerFormModel;
        return (
          <McpServerForm
            mode="edit"
            model={formModel}
            running={isRunning}
            saving={false}
            onSave={props.onSave}
            onCancel={props.onCancel}
          />
        );
      }

      // 非编辑状态下的紧凑展示
      return (
        <div class="px-4 py-4 flex items-start justify-between space-x-4 text-sm">
          <div class="flex items-start space-x-3">
            <div class="shrink-0">
              <div class="h-8 w-8 rounded-full flex items-center justify-center bg-gray-100">
                <span class="text-sm">🛠️</span>
              </div>
            </div>
            <div class="space-y-1">
              <div class="flex items-center space-x-2">
                <div class="text-sm font-medium text-gray-900">{name}</div>
                <span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                  {mcp.kind}
                </span>
              </div>
              <div class="text-gray-500">ID: {mcp.id}</div>
              <div class="text-gray-500">前缀: {prefixLabel}</div>
              {mcp.kind === "http" ? (
                <>
                  <div class="text-gray-500">
                    URL:{" "}
                    <code class="overflow-hidden text-ellipsis break-all text-xs">{mcp.command ?? ""}</code>
                  </div>
                  <div class="text-gray-500">
                    请求头: {Object.keys(mcp.headers ?? {}).length} 个
                  </div>
                </>
              ) : (
                <>
                  <div class="text-gray-500">
                    命令: <code class="overflow-hidden text-ellipsis break-all text-xs">{commandLabel}</code>
                  </div>
                  <div class="text-gray-500">
                    环境变量: {envEntries.length} 个
                  </div>
                </>
              )}
            </div>
          </div>
          <div class="flex flex-col items-end space-y-1">
            <div
              class={`text-sm ${
                mcp.enabled ? "text-green-600" : "text-gray-500"
              }`}
            >
              配置: {mcp.enabled ? "启用" : "禁用"}
            </div>
            <div
              class={`text-sm ${
                isRunning ? "text-green-600" : "text-red-600"
              }`}
            >
              运行状态: {isRunning ? "运行中" : "未运行"}
            </div>
            <div class="mt-2">
              <button
                type="button"
                class="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                onClick={props.onStartEdit}
              >
                编辑
              </button>
            </div>
          </div>
        </div>
      );
    };
  },
});
