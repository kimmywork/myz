import { defineComponent } from "vue";

export default defineComponent({
  name: "MonitorAgents",
  setup() {
    const agentStatus = [
      { name: "数据分析智能体", status: "活跃", tasks: 3, memory: "256MB" },
      { name: "文档处理智能体", status: "空闲", tasks: 0, memory: "128MB" },
    ];

    return () => (
      <div class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900">智能体状态</h3>
        <div class="bg-white shadow overflow-hidden sm:rounded-md">
          <ul class="divide-y divide-gray-200">
            {agentStatus.map((agent, index) => (
              <li key={index}>
                <div class="px-4 py-4 sm:px-6">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center">
                      <div class="shrink-0">
                        <div
                          class={`h-8 w-8 rounded-full flex items-center justify-center ${
                            agent.status === "活跃"
                              ? "bg-green-100"
                              : "bg-gray-100"
                          }`}
                        >
                          <span class="text-sm">👥</span>
                        </div>
                      </div>
                      <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900">
                          {agent.name}
                        </div>
                        <div class="text-sm text-gray-500">
                          状态: {agent.status}
                        </div>
                      </div>
                    </div>
                    <div class="flex space-x-4">
                      <div class="text-right">
                        <div class="text-sm text-gray-500">任务数</div>
                        <div class="text-sm font-medium text-gray-900">
                          {agent.tasks}
                        </div>
                      </div>
                      <div class="text-right">
                        <div class="text-sm text-gray-500">内存使用</div>
                        <div class="text-sm font-medium text-gray-900">
                          {agent.memory}
                        </div>
                      </div>
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