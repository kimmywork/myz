import {
  defineComponent,
  ref,
  reactive,
  computed,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import { sendMessage } from "../shared/messaging.js";
import { renderMarkdown } from "../shared/markdownRenderer.js";
import {
  saveConversation,
  saveMessage,
  getConversation,
  getMessagesForConversation,
  checkContextSize,
  compressContext,
} from "./aiStorage.js";
import HistoryView from "./HistoryView.jsx";
import SaveHighlightModal from "./SaveHighlightModal.jsx";
import "./history.css";

export default defineComponent({
  name: "SidePanelApp",
  setup() {
    // View state
    const view = ref("chat"); // 'chat' or 'history'

    // Core state
    const conversationId = ref(null);
    const messages = ref([]);
    const isLoading = ref(false);
    const error = ref("");
    const currentUrl = ref("");
    const pageTitle = ref("");
    const pageContent = ref("");
    const sendContext = ref(true); // Toggle to include/exclude page context
    const isContextPreferenceUpdating = ref(false);
    const visibleMessages = computed(() =>
      sendContext.value
        ? messages.value
        : messages.value.filter(
            (msg) => msg.metadata?.type !== "page_context",
          ),
    );

    // Auto-action state
    const autoAction = ref(null); // 'summarize', 'key_points', etc.

    // Input state
    const userInput = ref("");
    const inputPlaceholder = ref("输入消息...");
    const isSavingHighlight = ref(false);

    // Modal state
    const saveModal = reactive({
      visible: false,
      aiResponse: "",
      messageId: null,
    });

    // Context management
    const contextInfo = reactive({
      size: 0,
      maxSize: 32768,
      percentage: 0,
      needsCompression: false,
    });

    const messageListRef = ref(null);
    let runtimeListener = null;

    function hasPageContextMessage(list = messages.value) {
      return list.some((msg) => msg.metadata?.type === "page_context");
    }

    async function persistSendContextPreference(enabled) {
      if (!conversationId.value) return;
      try {
        const conversation = await getConversation(conversationId.value);
        if (!conversation) return;

        if (conversation.sendContextEnabled === enabled) {
          return;
        }

        conversation.sendContextEnabled = enabled;
        await saveConversation(conversation);
      } catch (e) {
        console.warn("Failed to persist sendContext preference:", e);
      }
    }

    async function initialize() {
      try {
        // Get current tab info
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab) {
          currentUrl.value = tab.url || "";
          pageTitle.value = tab.title || "";

          // Try to extract content from the active tab
          try {
            const result = await chrome.tabs
              .sendMessage(tab.id, {
                type: "myz:extractPageContent",
              })
              .catch(() => null);

            // Handle different response formats
            let responseData = result;
            if (result && result.data) {
              responseData = result.data;
            }

            if (responseData && responseData.text) {
              pageContent.value = responseData.text;

              // If content is too short, prompt user to select text
              if (pageContent.value.length < 200) {
                inputPlaceholder.value =
                  "输入您的问题，或先选中页面上的文本...";
              } else {
                inputPlaceholder.value = "输入您的问题...";
              }
            } else {
              pageContent.value = "";
              inputPlaceholder.value =
                "请选中页面上您想要讨论的文本，然后在下方输入您的问题。";
            }
          } catch (e) {
            console.warn("Could not extract page content:", e);
            inputPlaceholder.value = "请输入您的问题...";
            pageContent.value = "";
          }
        } else {
          inputPlaceholder.value = "请输入您的问题...";
          pageContent.value = "";
        }

        // Create new conversation
        await createNewConversation();

        // Load existing messages for this conversation
        if (conversationId.value) {
          const existingMessages = await getMessagesForConversation(
            conversationId.value,
            1000,
          );
          if (existingMessages.length > 0) {
            messages.value = existingMessages;
          }
        }
      } catch (e) {
        console.error("Initialization failed:", e);
        error.value = "初始化失败: " + e.message;
      }
    }

    async function createNewConversation() {
      try {
        // Create conversation object
        const conversationData = {
          id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: currentUrl.value,
          title: pageTitle.value || "新对话",
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isAiGenerated: false,
          sendContextEnabled: sendContext.value,
        };

        // Save conversation to IndexedDB
        await saveConversation(conversationData);

        conversationId.value = conversationData.id;
        messages.value = [];

        // Add initial system message with context only if sendContext is enabled
        if (pageContent.value && sendContext.value) {
          const systemMessage = {
            id: `msg-${Date.now()}`,
            conversationId: conversationData.id,
            role: "system",
            content: `页面上下文:\n标题: ${pageTitle.value}\nURL: ${currentUrl.value}\n\n内容:\n${pageContent.value.substring(0, 2000)}`,
            timestamp: new Date().toISOString(),
            metadata: { type: "page_context", url: currentUrl.value },
          };

          await saveMessage(systemMessage);

          messages.value.push(systemMessage);
        }
      } catch (e) {
        console.error("Failed to create conversation:", e);
        error.value = "创建对话失败: " + e.message;
      }
    }

    async function checkContext() {
      if (!conversationId.value) return;

      try {
        const result = await checkContextSize(
          conversationId.value,
          contextInfo.maxSize,
          {
            includePageContext: sendContext.value,
          },
        );
        contextInfo.size = result.estimatedTokens;
        contextInfo.percentage = result.percentage;
        contextInfo.needsCompression = result.needsCompression;
      } catch (e) {
        console.warn("Context check failed:", e);
      }
    }

    async function handleSendMessage() {
      if (!userInput.value.trim() || !conversationId.value) return;

      error.value = "";
      isLoading.value = true;

      try {
        // Check if we need to compress context first
        if (contextInfo.needsCompression) {
          const confirm = window.confirm(
            `对话上下文已达到 ${Math.round(contextInfo.percentage)}% 的限制，是否进行压缩？`,
          );
          if (confirm) {
            const compressed = await compressContext(
              conversationId.value,
              contextInfo.maxSize * 0.5,
            );
            if (compressed.compressed) {
              // Update messages with compressed version
              messages.value = compressed.messages;
              await checkContext();
            }
          }
        }

        // Get selected text from current page
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        let selectedContent = "";
        if (tab && tab.id) {
          try {
            const result = await chrome.tabs.sendMessage(tab.id, {
              type: "myz:getSelection",
            });

            // Handle different response formats
            let responseData = result;
            if (result && result.data) {
              responseData = result.data;
            }

            if (responseData && responseData.text) {
              selectedContent = responseData.text;
            }
          } catch (e) {
            // Ignore errors
          }
        }

        // Prepare user message
        let fullInput = userInput.value;
        if (selectedContent) {
          fullInput = `${userInput.value}\n\n[选中文本]:\n${selectedContent}`;
        }

        // Add user message to UI
        const userMessage = {
          id: `msg-${Date.now()}`,
          role: "user",
          content: fullInput,
          timestamp: new Date().toISOString(),
          metadata: { type: "user_input" },
          conversationId: conversationId.value,
        };

        messages.value.push(userMessage);

        // Clear input
        userInput.value = "";

        // Scroll to bottom
        await nextTick();
        scrollToBottom();

        // Send to AI (this will save user, tool call, tool response, and final assistant messages to IndexedDB)
        const result = await sendMessage("myz:processWithAi", {
          conversationId: conversationId.value,
          action: "custom",
          content: fullInput,
          options: {
            includePageContext: sendContext.value,
          },
        });

        // Reload all messages from IndexedDB to include tool calls and tool responses
        const allMessages = await getMessagesForConversation(
          conversationId.value,
          1000
        );
        messages.value = allMessages;

        // Update context info
        await checkContext();
      } catch (e) {
        console.error("Message processing failed:", e);
        error.value = "处理消息失败: " + e.message;
      } finally {
        isLoading.value = false;
        await nextTick();
        scrollToBottom();
      }
    }

    async function handleSaveHighlight(messageId) {
      const message = messages.value.find((m) => m.id === messageId);
      if (!message || message.role !== "assistant") return;

      // Open save modal with AI response
      saveModal.visible = true;
      saveModal.aiResponse = message.content;
      saveModal.messageId = messageId;
    }

    async function handleModalSave({ note, tags }) {
      const messageId = saveModal.messageId;
      const message = messages.value.find((m) => m.id === messageId);
      if (!message) return;

      isSavingHighlight.value = true;

      try {
        // Save the highlight - AI response goes in text field, user note in note field
        await sendMessage("myz:saveAiGeneratedHighlight", {
          url: currentUrl.value,
          title: pageTitle.value,
          text: message.content, // AI response as the main text
          note: note, // User's note
          tags: tags,
          conversationId: conversationId.value,
          model: message.metadata?.model || "unknown",
          action: "custom",
          messageId: message.id,
          timestamp: message.timestamp,
        });

        // Show success feedback
        message.metadata = {
          ...message.metadata,
          savedAsHighlight: true,
        };

        error.value = "✅ 已保存为摘录";
        setTimeout(() => {
          error.value = "";
        }, 3000);

        // Close modal
        saveModal.visible = false;
        saveModal.aiResponse = "";
        saveModal.messageId = null;
      } catch (e) {
        console.error("Failed to save highlight:", e);
        error.value = "保存失败: " + e.message;
      } finally {
        isSavingHighlight.value = false;
      }
    }

    function handleModalClose() {
      saveModal.visible = false;
      saveModal.aiResponse = "";
      saveModal.messageId = null;
    }

    async function handleContextToggle(event) {
      const enabled = Boolean(event?.target?.checked);
      if (sendContext.value === enabled && conversationId.value) {
        return;
      }

      sendContext.value = enabled;
      if (!conversationId.value) {
        return;
      }

      if (isContextPreferenceUpdating.value) {
        return;
      }

      isContextPreferenceUpdating.value = true;
      try {
        await persistSendContextPreference(enabled);
        await checkContext();
      } finally {
        isContextPreferenceUpdating.value = false;
      }
    }

    function scrollToBottom() {
      if (messageListRef.value) {
        messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
      }
    }

    function showHistory() {
      view.value = "history";
    }

    function showChat(selectedConv = null) {
      view.value = "chat";
      if (selectedConv) {
        conversationId.value = selectedConv.conversationId;
        pageTitle.value = selectedConv.title;
        currentUrl.value = selectedConv.url;
        messages.value = selectedConv.messages;
        const hasContext = hasPageContextMessage(selectedConv.messages);
        if (typeof selectedConv.sendContextEnabled === "boolean") {
          sendContext.value = selectedConv.sendContextEnabled;
        } else {
          sendContext.value = hasContext;
        }
      }
    }

    async function handleKeydown(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        await handleSendMessage();
      }
    }

    onMounted(async () => {
      await initialize();

      // Listen for real-time message updates (tool calls, tool responses)
      runtimeListener = (message) => {
        // Handle auto-action messages (e.g., from context menu)
        if (
          message.type === "myz:openSidePanelWithAction" &&
          message.payload?.action
        ) {
          autoAction.value = message.payload.action;
          setTimeout(async () => {
            await handleAutoAction();
          }, 100);
        }
        // Handle real-time new messages (e.g., from tool calls/responses)
        else if (message.type === "myz:newMessage" && message.data?.message) {
          if (
            conversationId.value &&
            message.data.conversationId === conversationId.value
          ) {
            messages.value.push(message.data.message);
            nextTick(() => {
              scrollToBottom();
            });
          }
        }
      };

      chrome.runtime.onMessage.addListener(runtimeListener);
    });

    onBeforeUnmount(() => {
      if (runtimeListener) {
        chrome.runtime.onMessage.removeListener(runtimeListener);
        runtimeListener = null;
      }
    });

    async function handleAutoAction() {
      if (!autoAction.value || isLoading.value) return;

      const action = autoAction.value;
      autoAction.value = null; // Clear after processing

      // Set input based on action type
      if (action === "summarize") {
        userInput.value = "请总结当前页面的内容";
      } else if (action === "key_points") {
        userInput.value = "请提取当前页面的要点";
      } else if (action === "find_related_logseq") {
        userInput.value = "请查找与当前页面相关的LogSeq笔记";
      } else if (action === "custom") {
        userInput.value = "请问关于当前页面的问题";
      }

      // Auto-send the message
      if (userInput.value) {
        await handleSendMessage();
      }
    }

    return () => (
      <div class="side-panel">
        {view.value === "history" ? (
          <HistoryView
            onSelectConversation={showChat}
            onBack={() => showChat()}
          />
        ) : (
          <>
            <header class="panel-header">
              <h1>AI 智能助理</h1>
              {contextInfo.needsCompression && (
                <span
                  class="context-warning"
                  title={`Context ${Math.round(contextInfo.percentage)}% full`}
                >
                  ⚠️ {Math.round(contextInfo.percentage)}%
                </span>
              )}
              <button
                class="btn btn-secondary"
                onClick={showHistory}
                title="查看对话历史"
              >
                历史
              </button>
            </header>

            <div class="url-info">
              <div class="url-title">{pageTitle.value || "当前页面"}</div>
              <div class="url-address">
                {currentUrl.value || "未获取页面地址"}
              </div>

              <label class="context-toggle">
                <input
                  type="checkbox"
                  checked={sendContext.value}
                  disabled={
                    !conversationId.value || isContextPreferenceUpdating.value
                  }
                  onChange={handleContextToggle}
                />
                <span>发送页面上下文</span>
              </label>
            </div>

            <div class="conversation-container" ref={messageListRef}>
              {visibleMessages.value.length === 0 && (
                <div class="empty-state">
                  <p>💬 开始与AI对话</p>
                  <p class="hint">输入您的问题，或选择页面文本进行提问</p>
                </div>
              )}

              {visibleMessages.value.map((msg) => (
                <div
                  key={msg.id}
                  class={`message message-${msg.role}`}
                  style={
                    msg.metadata?.type === "page_context"
                      ? "opacity: 0.6; font-size: 12px;"
                      : ""
                  }
                >
                  <div class="message-header">
                    <span class="message-role">
                      {msg.role === "user"
                        ? "用户"
                        : msg.role === "assistant"
                          ? "AI助手"
                          : msg.role === "tool"
                            ? "工具"
                            : "系统"}
                    </span>
                    <span class="message-time">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                    {msg.role === "assistant" && (
                      <button
                        class="btn btn-secondary save-highlight-btn"
                        onClick={() => handleSaveHighlight(msg.id)}
                        disabled={isSavingHighlight.value}
                      >
                        保存
                      </button>
                    )}
                  </div>
                  {msg.role === "assistant" ? (
                    <div class="message-content">
                      {msg.metadata?.hasToolCalls && (
                        <div class="tool-calls-info">
                          <small>🔧 AI正在通过以下工具检索信息:</small>
                          <div class="tool-names">
                            {msg.metadata?.toolNames || ""}
                          </div>
                        </div>
                      )}
                      {msg.content && (
                        <div
                          class="message-content-markdown"
                          v-html={renderMarkdown(msg.content)}
                        />
                      )}
                    </div>
                  ) : msg.role === "tool" ? (
                    <div class="message-content message-content-tool">
                      <div class="tool-info">
                        <small>🔧 工具响应</small>
                      </div>
                      <div class="message-content-text">{msg.content}</div>
                    </div>
                  ) : (
                    <div class="message-content message-content-text">
                      {msg.content}
                    </div>
                  )}
                </div>
              ))}

              {isLoading.value && (
                <div class="message message-loading">
                  <span class="loading-spinner">⏳</span>
                  AI正在思考...
                </div>
              )}
            </div>

            <div class="input-container">
              <textarea
                v-model={userInput.value}
                placeholder={inputPlaceholder.value}
                rows={3}
                onKeydown={handleKeydown}
                disabled={isLoading.value}
              />
              <button
                class="send-btn"
                onClick={handleSendMessage}
                disabled={!userInput.value.trim() || isLoading.value}
              >
                发送
              </button>
            </div>

            {error.value && <div class="error-message">{error.value}</div>}

            <SaveHighlightModal
              visible={saveModal.visible}
              aiResponse={saveModal.aiResponse}
              onSave={handleModalSave}
              onClose={handleModalClose}
            />
          </>
        )}
      </div>
    );
  },
});
