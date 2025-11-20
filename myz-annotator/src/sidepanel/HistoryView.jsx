import { defineComponent, ref, onMounted } from "vue";
import {
  listConversations,
  getMessagesForConversation,
  deleteConversation,
} from "./aiStorage.js";

export default defineComponent({
  name: "HistoryView",
  props: {
    onSelectConversation: {
      type: Function,
      required: true,
    },
    onBack: {
      type: Function,
      required: true,
    },
  },
  setup(props) {
    const conversations = ref([]);
    const isLoading = ref(true);

    async function loadConversations() {
      isLoading.value = true;
      try {
        // Get all conversations
        const allConversations = await listConversations(100);

        // Filter to only show conversations with AI responses (assistant messages)
        const filtered = [];
        for (const conv of allConversations) {
          try {
            const messages = await getMessagesForConversation(conv.id, 1000);
            // Check if there's at least one assistant message
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

    async function selectConversation(conv) {
      try {
        const messages = await getMessagesForConversation(conv.id, 1000);
        props.onSelectConversation({
          conversationId: conv.id,
          title: conv.title,
          url: conv.url,
          messages: messages,
        });
      } catch (e) {
        console.error("Failed to load conversation:", e);
      }
    }

    async function deleteConv(convId) {
      if (confirm("确定要删除这个对话吗？")) {
        try {
          await deleteConversation(convId);
          await loadConversations();
        } catch (e) {
          console.error("Failed to delete conversation:", e);
        }
      }
    }

    function formatDate(dateString) {
      try {
        return new Date(dateString).toLocaleString();
      } catch (e) {
        return dateString;
      }
    }

    function truncate(text, length = 100) {
      if (!text) return "";
      return text.length > length ? text.slice(0, length) + "..." : text;
    }

    onMounted(() => {
      loadConversations();
    });

    return () => (
      <div class="history-view">
        <header class="history-header">
          <h2>对话历史</h2>
          <button class="btn btn-secondary" onClick={props.onBack}>
            返回
          </button>
        </header>

        {isLoading.value ? (
          <div class="loading">加载中...</div>
        ) : conversations.value.length === 0 ? (
          <div class="empty-state">
            <p>暂无对话历史</p>
            <p class="hint">与AI助理的对话将自动保存到这里</p>
          </div>
        ) : (
          <ul class="conversation-list">
            {conversations.value.map((conv) => (
              <li key={conv.id} class="conversation-item">
                <div
                  class="conversation-info"
                  onClick={() => selectConversation(conv)}
                >
                  <div class="conversation-title">
                    {conv.title || "未命名对话"}
                  </div>
                  <div class="conversation-url" title={conv.url}>
                    {truncate(conv.url)}
                  </div>
                  <div class="conversation-meta">
                    <span class="conversation-date">
                      {formatDate(conv.updatedAt)}
                    </span>
                  </div>
                </div>
                <button
                  class="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConv(conv.id);
                  }}
                  title="删除对话"
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
});
