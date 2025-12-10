import { defineComponent, onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

type McpServerStatus = {
  id: string;
  title?: string | null;
  prefix?: string | null;
  running: boolean;
  total_requests: number;
  total_errors: number;
  tools_count: number;
  tools_call_count: number;
};

export default defineComponent({
  name: "MonitorMCP",
  setup() {
    const services = ref<McpServerStatus[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);

    const load = async () => {
      loading.value = true;
      error.value = null;
      try {
        const result = await invoke<McpServerStatus[]>("mcp_list_servers");
        services.value = result;
      } catch (e) {
        console.error("failed to load MCP servers", e);
        error.value = "加载 MCP 服务状态失败";
        services.value = [];
      } finally {
        loading.value = false;
      }
    };

    onMounted(load);

    return () => (
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-medium text-gray-900">MCP 服务状态</h3>
          <button
            type="button"
            class="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            onClick={load}
            disabled={loading.value}
          >
            {loading.value ? "刷新中..." : "刷新"}
          </button>
        </div>

        {error.value && (
          <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error.value}
          </div>
        )}

        <div class="bg-white shadow overflow-hidden sm:rounded-md">
          {services.value.length === 0 && !loading.value ? (
            <div class="px-4 py-6 text-sm text-gray-500">
              当前没有已配置的 MCP 服务。
            </div>
          ) : (
            <ul class="divide-y divide-gray-200">
              {services.value.map((service) => {
                const isRunning = service.running;
                const statusLabel = isRunning ? "运行中" : "已停止";
                const name = service.title ?? service.id;
                return (
                  <li key={service.id}>
                    <div class="px-4 py-4 flex items-center justify-between sm:px-6">
                      <div class="flex items-center">
                        <div class="shrink-0">
                          <div
                            class={`h-8 w-8 rounded-full flex items-center justify-center ${
                              isRunning ? "bg-green-100" : "bg-red-100"
                            }`}
                          >
                            <span
                              class={`text-sm ${
                                isRunning ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {isRunning ? "✓" : "✗"}
                            </span>
                          </div>
                        </div>
                        <div class="ml-4">
                          <div class="text-sm font-medium text-gray-900">
                            {name}
                          </div>
                          <div class="text-xs text-gray-500 mt-1">
                            ID: {service.id}
                            {service.prefix && (
                              <span class="ml-2 text-xs text-gray-500 break-all">
                                前缀:{" "}
                                <code class="break-all text-[11px]">
                                  {service.prefix}
                                </code>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div class="text-right">
                        <div class="text-sm text-gray-900">
                          {service.total_requests} 请求
                        </div>
                        <div class="text-xs text-gray-500">
                          工具: {service.tools_count} 个 / 调用{" "}
                          {service.tools_call_count} 次
                        </div>
                        <div class="text-xs text-gray-500">
                          错误: {service.total_errors}
                        </div>
                        <div
                          class={`mt-1 text-sm ${
                            isRunning ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {statusLabel}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  },
});
