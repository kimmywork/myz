import { defineComponent, onBeforeUnmount, onMounted, provide } from "vue";
import { DashboardStoreKey, createDashboardStore } from "./store/index.js";
import AppShell from "./components/AppShell.jsx";

export default defineComponent({
  name: "DashboardApp",
  setup() {
    const store = createDashboardStore();
    provide(DashboardStoreKey, store);

    onMounted(async () => {
      try {
        await store.initialize();
      } catch (error) {
        console.error("Dashboard init failed", error);
      }
    });

    onBeforeUnmount(() => {
      store.cleanup();
    });

    return () => <AppShell />;
  },
});
