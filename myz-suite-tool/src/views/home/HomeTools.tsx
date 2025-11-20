import { defineComponent } from "vue";

export default defineComponent({
  name: "HomeTools",
  setup() {
    const quickTools = [
      {
        name: "启动 MCP 服务",
        description: "启动 MCP 工具托管服务",
        icon: "🚀",
        action: () => console.log("启动 MCP 服务"),
      },
      {
        name: "环境检查",
        description: "检查系统环境配置",
        icon: "🔍",
        action: () => console.log("环境检查"),
      },
      {
        name: "快速部署",
        description: "一键部署套件环境",
        icon: "⚡",
        action: () => console.log("快速部署"),
      },
      {
        name: "模型管理",
        description: "管理本地大模型",
        icon: "🤖",
        action: () => console.log("模型管理"),
      },
    ];

    return () => (
      <div class="space-y-6">
        <h2 class="text-lg font-medium text-gray-900 mb-4">快捷工具</h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickTools.map((tool, index) => (
            <div
              key={index}
              onClick={tool.action}
              class="bg-white overflow-hidden shadow rounded-lg border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div class="p-4">
                <div class="flex items-center">
                  <div class="shrink-0">
                    <span class="text-2xl">{tool.icon}</span>
                  </div>
                  <div class="ml-4">
                    <h3 class="text-sm font-medium text-gray-900">
                      {tool.name}
                    </h3>
                    <p class="text-sm text-gray-500">{tool.description}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
});