import { defineComponent, onBeforeUnmount, onMounted, provide } from "vue";
import AppShell from "./components/AppShell.jsx";
import { DashboardStoreKey, createDashboardStore } from "./store/index.js";

export default defineComponent({
  name: "DashboardApp",
  setup() {
    const store = createDashboardStore();
    provide(DashboardStoreKey, store);

    onMounted(async () => {
      try {
        await store.initialize();
        console.info("Dashboard initialized");
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
