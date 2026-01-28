import { defineStore } from "pinia";
import { ref, Ref } from "vue";
import {
  listConversations,
  getMessagesForConversation,
  deleteConversation,
  ConversationInfo,
} from "../aiStorage.js";

export const useHistoryStore = defineStore("history", () => {
  const conversations: Ref<ConversationInfo[]> = ref([]);
  const isLoading = ref(true);

  async function loadConversations() {
    isLoading.value = true;
    try {
      const allConversations = await listConversations(100);
      const filtered = [];
      for (const conv of allConversations) {
        try {
          const messages = await getMessagesForConversation(conv.id, 1000);
          const hasAIResponse = messages.some((m) => m.role === "assistant");
          if (hasAIResponse) {
            filtered.push(conv);
          }
        } catch (e) {
          console.warn("Failed to check conversation:", conv.id, e);
        }
      }
      conversations.value = filtered;
    } catch (e) {
      console.error("Failed to load conversations:", e);
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteConv(convId: string) {
    try {
      await deleteConversation(convId);
      await loadConversations();
    } catch (e) {
      console.error("Failed to delete conversation:", e);
      throw e;
    }
  }

  return {
    conversations,
    isLoading,
    loadConversations,
    deleteConv,
  };
});
