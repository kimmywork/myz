import { defineComponent } from "vue";

export default defineComponent({
  name: "GeneralSettings",
  setup() {
    return () => (
      <div class="space-y-6">
        <h3 class="text-lg font-medium text-gray-900">基础设置</h3>
        <div class="bg-white shadow sm:rounded-lg">
          <div class="px-4 py-5 sm:p-6 space-y-6">
            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium text-gray-900">
                  主题
                </label>
                <p class="text-sm text-gray-500">选择界面主题</p>
              </div>
              <select class="mt-1 block w-32 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                <option value="light">浅色</option>
                <option value="dark">深色</option>
                <option value="auto">自动</option>
              </select>
            </div>

            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium text-gray-900">
                  语言
                </label>
                <p class="text-sm text-gray-500">界面显示语言</p>
              </div>
              <select class="mt-1 block w-32 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                <option value="zh-CN">简体中文</option>
                <option value="en-US">English</option>
              </select>
            </div>

            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium text-gray-900">
                  开机自启
                </label>
                <p class="text-sm text-gray-500">系统启动时自动运行</p>
              </div>
              <button class="relative inline-flex shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 bg-blue-600">
                <span class="translate-x-5 pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200" />
              </button>
            </div>

            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium text-gray-900">
                  通知
                </label>
                <p class="text-sm text-gray-500">接收系统通知</p>
              </div>
              <button class="relative inline-flex shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 bg-blue-600">
                <span class="translate-x-5 pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  },
});