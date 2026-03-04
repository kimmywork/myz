import { defineComponent } from "vue";

export default defineComponent({
  name: "DashboardConversationEmptyState",
  setup() {
    return () => (
      <div class="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
        <p class="text-base font-medium">💬 开始与AI对话</p>
        <p class="mt-1 text-xs">输入您的问题开始新的对话</p>
      </div>
    );
  },
});
