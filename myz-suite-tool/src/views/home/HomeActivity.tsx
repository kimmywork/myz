import { defineComponent } from "vue";

export default defineComponent({
  name: "HomeActivity",
  setup() {
    return () => (
      <div class="space-y-6">
        <h2 class="text-lg font-medium text-gray-900 mb-4">最近活动</h2>
        <div class="bg-white shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <div class="space-y-3">
              <div class="flex items-center text-sm text-gray-600">
                <span class="mr-2">🕒</span>
                <span>刚刚启动了 MCP 服务</span>
              </div>
              <div class="flex items-center text-sm text-gray-600">
                <span class="mr-2">🕒</span>
                <span>10 分钟前检查了系统环境</span>
              </div>
              <div class="flex items-center text-sm text-gray-600">
                <span class="mr-2">🕒</span>
                <span>1 小时前添加了新的模型配置</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
});