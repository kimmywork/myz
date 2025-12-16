import { inject } from "vue";
import { DashboardStore, DashboardStoreKey } from "./index.js";

export function useDashboardStore(): DashboardStore {
  const store = inject(DashboardStoreKey) as DashboardStore | null;
  if (!store) {
    throw new Error("Dashboard store not provided");
  }
  return store;
}
