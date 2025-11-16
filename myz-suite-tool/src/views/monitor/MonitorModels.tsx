import { defineComponent } from "vue";

export default defineComponent({
  name: "MonitorModels",
  setup() {
    const modelStatus = [
      { name: "GPT-4", status: "在线", load: "45%", latency: "120ms" },
      { name: "Claude", status: "在线", load: "30%", latency: "95ms" },
      { name: "本地模型", status: "离线", load: "-", latency: "-" },
    ];

    return () => (
      <div class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900">模型状态</h3>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modelStatus.map((model, index) => (
            <div
              key={index}
              class="bg-white overflow-hidden shadow rounded-lg"
            >
              <div class="px-4 py-5 sm:p-6">
                <div class="flex items-center">
                  <div class="shrink-0">
                    <div
                      class={`h-10 w-10 rounded-full flex items-center justify-center ${
                        model.status === "在线"
                          ? "bg-blue-100"
                          : "bg-gray-100"
                      }`}
                    >
                      <span class="text-lg">🤖</span>
                    </div>
                  </div>
                  <div class="ml-4">
                    <h3 class="text-lg font-medium text-gray-900">
                      {model.name}
                    </h3>
                    <p
                      class={`text-sm ${
                        model.status === "在线"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {model.status}
                    </p>
                  </div>
                </div>
                <div class="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p class="text-sm text-gray-500">负载</p>
                    <p class="text-sm font-medium text-gray-900">
                      {model.load}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500">延迟</p>
                    <p class="text-sm font-medium text-gray-900">
                      {model.latency}
                    </p>
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