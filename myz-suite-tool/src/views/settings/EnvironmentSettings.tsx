import { defineComponent } from "vue";

export default defineComponent({
  name: "EnvironmentSettings",
  setup() {
    const environmentSettings = {
      pythonPath: "/usr/bin/python3",
      nodePath: "/usr/bin/node",
      rustPath: "/usr/bin/cargo",
    };

    return () => (
      <div class="space-y-6">
        <h3 class="text-lg font-medium text-gray-900">环境管理</h3>
        <div class="bg-white shadow sm:rounded-lg">
          <div class="px-4 py-5 sm:p-6 space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">
                Python 路径
              </label>
              <input
                type="text"
                value={environmentSettings.pythonPath}
                class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">
                Node.js 路径
              </label>
              <input
                type="text"
                value={environmentSettings.nodePath}
                class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">
                Rust 路径
              </label>
              <input
                type="text"
                value={environmentSettings.rustPath}
                class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
});