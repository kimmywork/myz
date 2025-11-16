import { defineComponent } from "vue";
import { RouterView } from "vue-router";

export default defineComponent({
  name: "Home",
  setup() {
    return () => (
      <>
        {/* Main Content */}
        <div class="space-y-6">
          {/* Page Header */}
          <div>
            <h1 class="text-2xl font-bold text-gray-900">系统概览</h1>
            <p class="mt-1 text-sm text-gray-600">
              MyZ 套件工具的整体状态和快速访问
            </p>
          </div>

          {/* Tab Content */}
          <RouterView />
        </div>
      </>
    );
  },
});
