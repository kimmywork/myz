import { defineComponent } from "vue";

export default defineComponent({
  name: "MonitorMCP",
  setup() {
    const mcpServices = [
      {
        name: "文件系统工具",
        status: "运行中",
        uptime: "2小时",
        requests: 156,
      },
      { name: "数据库工具", status: "运行中", uptime: "1小时", requests: 89 },
      { name: "网络工具", status: "已停止", uptime: "-", requests: 0 },
    ];

    return () => (
      <div class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900">MCP 服务状态</h3>
        <div class="bg-white shadow overflow-hidden sm:rounded-md">
          <ul class="divide-y divide-gray-200">
            {mcpServices.map((service, index) => (
              <li key={index}>
                <div class="px-4 py-4 flex items-center justify-between sm:px-6">
                  <div class="flex items-center">
                    <div class="shrink-0">
                      <div
                        class={`h-8 w-8 rounded-full flex items-center justify-center ${
                          service.status === "运行中"
                            ? "bg-green-100"
                            : "bg-red-100"
                        }`}
                      >
                        <span
                          class={`text-sm ${
                            service.status === "运行中"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {service.status === "运行中" ? "✓" : "✗"}
                        </span>
                      </div>
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900">
                        {service.name}
                      </div>
                      <div class="text-sm text-gray-500">
                        运行时间: {service.uptime}
                      </div>
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm text-gray-900">
                      {service.requests} 请求
                    </div>
                    <div
                      class={`text-sm ${
                        service.status === "运行中"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {service.status}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  },
});