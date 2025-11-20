import { defineComponent } from "vue";

export default defineComponent({
  name: "MCPSettings",
  setup() {
    const mcpSettings = [
      { name: "文件系统 MCP", enabled: true, path: "/path/to/file-mcp" },
      { name: "数据库 MCP", enabled: false, path: "/path/to/db-mcp" },
      { name: "网络 MCP", enabled: true, path: "/path/to/network-mcp" },
    ];

    return () => (
      <div class="space-y-6">
        <h3 class="text-lg font-medium text-gray-900">MCP 管理</h3>
        <div class="bg-white shadow overflow-hidden sm:rounded-md">
          <ul class="divide-y divide-gray-200">
            {mcpSettings.map((mcp, index) => (
              <li key={index}>
                <div class="px-4 py-4 flex items-center justify-between">
                  <div class="flex items-center">
                    <div class="shrink-0">
                      <div
                        class={`h-8 w-8 rounded-full flex items-center justify-center ${
                          mcp.enabled ? "bg-green-100" : "bg-gray-100"
                        }`}
                      >
                        <span class="text-sm">🛠️</span>
                      </div>
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900">
                        {mcp.name}
                      </div>
                      <div class="text-sm text-gray-500">{mcp.path}</div>
                    </div>
                  </div>
                  <button
                    class={`relative inline-flex shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                      mcp.enabled ? "bg-blue-600" : "bg-gray-200"
                    }`}
                  >
                    <span
                      class={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${
                        mcp.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  },
});