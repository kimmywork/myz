import { computed, defineComponent } from "vue";
import { RouterView } from "vue-router";
import DashboardNavbar from "./DashboardNavbar.jsx";
import RecordModal from "./RecordModal.jsx";
import { useThemePreference } from "@/shared/theme.js";

export default defineComponent({
  name: "AppShell",
  setup() {
    const { theme } = useThemePreference();
    const shellClasses = computed(() => [
      "app-shell min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100",
      theme.value === "dark" ? "dark" : "",
    ]);
    return () => (
      <div class={shellClasses.value.join(" ")}>
        <div class="mx-auto w-full px-4 py-8 sm:px-6 lg:px-10">
          <div class="mx-auto flex w-full flex-col gap-6 lg:w-5/6 lg:max-w-[1400px]">
            <DashboardNavbar />
            <main class="flex flex-col gap-6">
              <RouterView />
            </main>
          </div>
        </div>
        <RecordModal />
      </div>
    );
  },
});
