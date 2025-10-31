import { inject } from "vue";
import { DashboardStoreKey } from "./index.js";

export function useDashboardStore() {
  const store = inject(DashboardStoreKey);
  if (!store) {
    throw new Error("Dashboard store not provided");
  }
  return store;
}
