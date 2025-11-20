import { defineComponent } from "vue";

export default defineComponent({
  name: "AgentSettings",
  setup() {
    return () => (
      <div class="text-center py-12">
        <div class="text-gray-400 text-6xl mb-4">👥</div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">
          智能体管理
        </h3>
        <p class="text-gray-500">智能体管理功能正在开发中，敬请期待。</p>
      </div>
    );
  },
});