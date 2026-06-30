import { defineStore } from "pinia";
import { ref } from "vue";
import { getConversation } from "../aiStorage.js";
import {
  normalizeTaskPlanPayload,
  type TaskPlan,
} from "@/background/ai/tasks/taskManager";

export const useTaskPlanStore = defineStore("taskPlan", () => {
  const conversationId = ref<string | null>(null);
  const taskPlan = ref<TaskPlan | null>(null);
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
      taskPlan.value = normalizeTaskPlanPayload(
        conversation?.metadata?.taskPlan,
      );
    } catch (error) {
      console.warn("Failed to load task plan", error);
      taskPlan.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  function setPlan(plan: TaskPlan | null) {
    taskPlan.value = plan;
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
