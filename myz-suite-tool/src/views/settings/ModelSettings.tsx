import { defineComponent } from "vue";

export default defineComponent({
  name: "ModelSettings",
  setup() {
    const modelSettings = [
      {
        name: "OpenAI API",
        enabled: true,
        apiKey: "••••••••",
        baseUrl: "https://api.openai.com",
      },
      {
        name: "Anthropic API",
        enabled: false,
        apiKey: "",
        baseUrl: "https://api.anthropic.com",
      },
      {
        name: "本地模型",
        enabled: true,
        apiKey: "",
        baseUrl: "http://localhost:8080",
      },
    ];

    return () => (
      <div class="space-y-6">
        <h3 class="text-lg font-medium text-gray-900">模型接口设置</h3>
        <div class="bg-white shadow overflow-hidden sm:rounded-md">
          <ul class="divide-y divide-gray-200">
            {modelSettings.map((model, index) => (
              <li key={index}>
                <div class="px-4 py-4">
                  <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center">
                      <div class="shrink-0">
                        <div
                          class={`h-8 w-8 rounded-full flex items-center justify-center ${
                            model.enabled ? "bg-blue-100" : "bg-gray-100"
                          }`}
                        >
                          <span class="text-sm">🤖</span>
                        </div>
                      </div>
                      <div class="ml-4">
                        <div class="text-sm font-medium text-gray-900">
                          {model.name}
                        </div>
                      </div>
                    </div>
                    <button
                      class={`relative inline-flex shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                        model.enabled ? "bg-blue-600" : "bg-gray-200"
                      }`}
                    >
                      <span
                        class={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${
                          model.enabled
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  {model.enabled && (
                    <div class="space-y-3">
                      <div>
                        <label class="block text-xs font-medium text-gray-700">
                          API Key
                        </label>
                        <input
                          type="password"
                          value={model.apiKey}
                          class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs"
                        />
                      </div>
                      <div>
                        <label class="block text-xs font-medium text-gray-700">
                          Base URL
                        </label>
                        <input
                          type="text"
                          value={model.baseUrl}
                          class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  },
});