import { defineStore } from "pinia";
import { ref } from "vue";
import { getConversation } from "../aiStorage.js";

export const useTaskPlanStore = defineStore("taskPlan", () => {
  const conversationId = ref<string | null>(null);
  const taskPlan = ref<any | null>(null);
  const isLoading = ref(false);

  async function loadPlan(convId: string | null) {
    conversationId.value = convId;
    if (!convId) {
      taskPlan.value = null;
      return;
    }
    isLoading.value = true;
    try {
      const conversation = await getConversation(convId);
      taskPlan.value = conversation?.metadata?.taskPlan || null;
    } catch (error) {
      console.warn("Failed to load task plan", error);
      taskPlan.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  function setPlan(plan: any) {
    taskPlan.value = plan || null;
  }

  function clearPlan() {
    taskPlan.value = null;
  }

  return {
    conversationId,
    taskPlan,
    isLoading,
    loadPlan,
    setPlan,
    clearPlan,
  };
});
