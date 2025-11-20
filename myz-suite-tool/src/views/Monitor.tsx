import { defineComponent } from "vue";
import { RouterView } from "vue-router";

export default defineComponent({
  name: "Monitor",
  setup() {

    return () => (
      <>
        {/* Main Content */}
        <div class="space-y-6">
          {/* Page Header */}
          <div>
            <h1 class="text-2xl font-bold text-gray-900">系统监控</h1>
            <p class="mt-1 text-sm text-gray-600">
              实时监控 MyZ 套件的各项服务状态
            </p>
          </div>

          {/* Tab Content */}
          <RouterView />
        </div>
      </>
    );
  },
});
