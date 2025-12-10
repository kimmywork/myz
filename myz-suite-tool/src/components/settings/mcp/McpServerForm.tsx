import { defineComponent, PropType } from "vue";

export type McpServerFormModel = {
  id: string;
  title: string;
  prefix: string;
  enabled: boolean;
  kind: string;
  command: string;
  args: string;
  env: string;
  headers: string;
};

export default defineComponent({
  name: "McpServerForm",
  props: {
    model: {
      type: Object as PropType<McpServerFormModel>,
      required: true,
    },
    mode: {
      type: String as PropType<"create" | "edit">,
      default: "create",
    },
    running: {
      type: Boolean,
      default: false,
    },
    saving: {
      type: Boolean,
      default: false,
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
      const isCreate = props.mode === "create";
      const model = props.model;

      return (
        <div class="bg-white shadow overflow-hidden sm:rounded-md p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="text-base font-semibold text-gray-900">
              {isCreate ? "新增 MCP 服务" : "编辑 MCP 服务"}
            </h4>
            {!isCreate && (
              <span
                class={[
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  props.running
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700",
                ].join(" ")}
              >
                {props.running ? "运行中" : "未运行"}
              </span>
            )}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div class="space-y-1">
              <label class="block text-sm font-medium text-gray-700">ID</label>
              <input
                class={[
                  "mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm",
                  isCreate
                    ? "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                    : "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed",
                ].join(" ")}
                v-model={model.id}
                placeholder="如 search"
                disabled={!isCreate}
              />
            </div>

            <div class="space-y-1">
              <label class="block text-sm font-medium text-gray-700">名称</label>
              <input
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                v-model={model.title}
                placeholder="显示名称，可选"
              />
            </div>

            <div class="space-y-1">
              <label class="block text-sm font-medium text-gray-700">前缀</label>
              <input
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                v-model={model.prefix}
                placeholder="如 search 或 search."
              />
            </div>

            <div class="space-y-1">
              <label class="block text-sm font-medium text-gray-700">类型</label>
              <div class="mt-1 relative">
                <select
                  class={[
                    "block w-full appearance-none rounded-md border px-3 py-2 pr-8 text-sm shadow-sm",
                    isCreate
                      ? "border-gray-300 bg-white focus:border-blue-500 focus:ring-blue-500"
                      : "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed",
                  ].join(" ")}
                  v-model={model.kind}
                  disabled={!isCreate}
                >
                  <option value="stdio">stdio</option>
                  <option value="http">http</option>
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg
                    class="h-4 w-4 text-gray-400"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6 8L10 12L14 8"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {model.kind === "http" ? (
              <>
                <div class="md:col-span-2 space-y-1">
                  <label class="block text-sm font-medium text-gray-700">
                    URL
                  </label>
                  <input
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    v-model={model.command}
                    placeholder="例如: http://127.0.0.1:9000/mcp"
                  />
                </div>
                <div class="md:col-span-2 space-y-1">
                  <label class="block text-sm font-medium text-gray-700">
                    请求头（每行 Header: Value）
                  </label>
                  <textarea
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    rows={3}
                    v-model={model.headers}
                    placeholder="Authorization: Bearer xxx"
                  />
                </div>
              </>
            ) : (
              <>
                <div class="md:col-span-2 space-y-1">
                  <label class="block text-sm font-medium text-gray-700">
                    命令
                  </label>
                  <input
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    v-model={model.command}
                    placeholder="例如: uvx 或 npx"
                  />
                </div>
                <div class="md:col-span-2 space-y-1">
                  <label class="block text-sm font-medium text-gray-700">
                    参数（以空格分隔）
                  </label>
                  <input
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    v-model={model.args}
                    placeholder="例如: mcp-myz-search --stdio"
                  />
                </div>
                <div class="md:col-span-2 space-y-1">
                  <label class="block text-sm font-medium text-gray-700">
                    环境变量（每行 KEY=VALUE）
                  </label>
                  <textarea
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    rows={3}
                    v-model={model.env}
                    placeholder="HTTP_PROXY=http://127.0.0.1:7890"
                  />
                </div>
              </>
            )}

            <div class="md:col-span-2 flex items-center space-x-2">
              <input
                id={isCreate ? "new-mcp-enabled" : "edit-mcp-enabled"}
                type="checkbox"
                class="h-4 w-4 text-blue-600 border-gray-300 rounded"
                v-model={model.enabled}
              />
              <label
                for={isCreate ? "new-mcp-enabled" : "edit-mcp-enabled"}
                class="text-sm text-gray-700 select-none"
              >
                {isCreate ? "新增后启用并尝试启动" : "启用该服务"}
              </label>
            </div>
          </div>

          <div class="flex justify-end space-x-2">
            <button
              type="button"
              class="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              onClick={props.onCancel}
              disabled={props.saving}
            >
              取消
            </button>
            <button
              type="button"
              class="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              onClick={props.onSave}
              disabled={props.saving}
            >
              保存
            </button>
          </div>
        </div>
      );
    };
  },
});

