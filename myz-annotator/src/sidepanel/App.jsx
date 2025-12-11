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
import {
  saveConversation,
  saveMessage,
  getConversation,
  getMessagesForConversation,
  checkContextSize,
  compressContext,
  deleteMessagesByConversationAndType,
} from "./aiStorage.js";
import HistoryView from "./HistoryView.jsx";
import SaveHighlightModal from "./SaveHighlightModal.jsx";
import ConversationList from "./components/ConversationList.jsx";
import PageContextCard from "./components/PageContextCard.jsx";
import InputComposer from "./components/InputComposer.jsx";
import ToolResponseModal from "./components/ToolResponseModal.jsx";
import ThemeToggle from "../shared/components/ThemeToggle.jsx";
import AutoInsightsPanel from "./components/AutoInsightsPanel.jsx";

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
    const currentTabId = ref(null);
    const pageTitle = ref("");
    const pageContent = ref("");
    const sendContext = ref(true); // Toggle to include/exclude page context
    const isContextPreferenceUpdating = ref(false);
    const isComposing = ref(false);
    const relatedMatches = ref([]);
    const visibleMessages = computed(() => {
      if (sendContext.value) {
        return messages.value;
      }
      return messages.value.filter(
        (msg) => msg.metadata?.type !== "page_context" && msg.role !== "system",
      );
    });

    // Auto-action state
    const autoAction = ref(null); // 'summarize', 'key_points', etc.
    const autoInsights = reactive({
      active: false,
      action: "",
      loading: false,
      error: "",
      markdown: "",
      chunkGroups: 0,
      context: null,
      generatedAt: "",
    });

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

    const activeStream = reactive({
      id: null,
      content: "",
      timestamp: "",
      reasoning: "",
      metadata: {},
    });
    const hasActiveStream = computed(() => Boolean(activeStream.id));

    const toolResponseViewer = reactive({
      visible: false,
      title: "",
      content: "",
      toolName: "",
      timestamp: "",
      args: "",
      invocationDetails: [],
    });
    const sortedRelatedMatches = computed(() =>
      relatedMatches.value
        .slice()
        .sort((a, b) => (b.score || 0) - (a.score || 0)),
    );

    function resetAutoInsights() {
      autoInsights.active = false;
      autoInsights.action = "";
      autoInsights.loading = false;
      autoInsights.error = "";
      autoInsights.markdown = "";
      autoInsights.chunkGroups = 0;
      autoInsights.context = null;
      autoInsights.generatedAt = "";
    }

    async function clearPageChunkAnchors() {
      if (!currentTabId.value) return;
      try {
        await chrome.tabs.sendMessage(currentTabId.value, {
          type: "myz:clearAiPageChunks",
        });
      } catch {
        // ignore - tab might not accept messages
      }
    }

    function closeAutoInsights() {
      clearPageChunkAnchors();
      resetAutoInsights();
    }

    function hasPageContextMessage(list = messages.value) {
      return list.some(
        (msg) =>
          msg.metadata?.type === "page_context" ||
          (msg.role === "system" && !msg.metadata?.type),
      );
    }

    function buildPageContextMessage(conversationId) {
      if (!pageContent.value) {
        return null;
      }
      return {
        id: `msg-${Date.now()}`,
        conversationId,
        role: "system",
        content: `页面上下文:\n标题: ${pageTitle.value}\nURL: ${currentUrl.value}\n\n内容:\n${pageContent.value.substring(0, 2000)}`,
        timestamp: new Date().toISOString(),
        metadata: { type: "page_context", url: currentUrl.value },
      };
    }

    function resetActiveStream() {
      activeStream.id = null;
      activeStream.content = "";
      activeStream.timestamp = "";
      activeStream.reasoning = "";
      activeStream.metadata = {};
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
          currentTabId.value = tab.id || null;
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
        if (sendContext.value) {
          const systemMessage = buildPageContextMessage(conversationData.id);
          if (systemMessage) {
            await saveMessage(systemMessage);
            messages.value.push(systemMessage);
          }
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

        // Ensure previous streaming state is cleared
        resetActiveStream();

        // Send to AI (this will save user, tool call, tool response, and final assistant messages to IndexedDB)
        await sendMessage("myz:processWithAi", {
          conversationId: conversationId.value,
          action: "custom",
          content: fullInput,
          options: {
            includePageContext: sendContext.value,
            stream: true,
          },
        });
      } catch (e) {
        console.error("Message processing failed:", e);
        error.value = "处理消息失败: " + e.message;
      } finally {
        isLoading.value = false;
        await nextTick();
        scrollToBottom();
      }
    }

    async function runAutoInsights(action) {
      autoInsights.active = true;
      autoInsights.action = action;
      autoInsights.loading = true;
      autoInsights.error = "";
      autoInsights.markdown = "";
      autoInsights.generatedAt = "";
      await clearPageChunkAnchors();

      if (!currentTabId.value) {
        autoInsights.error = "无法获取当前标签页";
        autoInsights.loading = false;
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(currentTabId.value, {
          type: "myz:captureAiPageContext",
          payload: {
            chunkCharLimit: 2000,
            maxChunks: 120,
            maxTotalChars: null,
          },
        });

        const contextData = response?.data || response;
        if (
          !contextData ||
          !Array.isArray(contextData.chunks) ||
          !contextData.chunks.length
        ) {
          throw new Error("未能解析页面主体内容");
        }

        autoInsights.context = contextData;

        const chunkPayload = contextData.chunks.map((chunk) => ({
          id: chunk.id,
          text: chunk.text,
          prefix: chunk.prefix,
        }));

        const aiResult = await sendMessage("myz:generatePageInsights", {
          action,
          title: pageTitle.value,
          url: currentUrl.value,
          chunks: chunkPayload,
        });

        if (!aiResult || aiResult.success === false) {
          throw new Error(aiResult?.error || "生成失败");
        }

        autoInsights.chunkGroups = aiResult.chunkGroups || 1;
        autoInsights.generatedAt =
          aiResult.generatedAt || new Date().toISOString();
        autoInsights.markdown =
          (aiResult.markdown || "").trim() ||
          (Array.isArray(aiResult.raw) ? aiResult.raw.join("\n\n") : "");
        if (!autoInsights.markdown) {
          throw new Error("未生成可显示的 Markdown");
        }
      } catch (err) {
        console.error("Auto insights failed:", err);
        autoInsights.error = err?.message || "生成失败";
      } finally {
        autoInsights.loading = false;
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

    async function handleScrollToCitation(chunkId, snippet = "") {
      if (!chunkId || !currentTabId.value) {
        return;
      }
      try {
        await chrome.tabs.sendMessage(currentTabId.value, {
          type: "myz:scrollToAiChunk",
          payload: { chunkId, snippet },
        });
      } catch (error) {
        console.warn("Failed to scroll to chunk", error);
      }
    }

    async function handleContextToggle(event) {
      const enabled = Boolean(event?.target?.checked ?? event);
      if (sendContext.value === enabled) {
        return;
      }

      sendContext.value = enabled;
      if (!conversationId.value || isContextPreferenceUpdating.value) {
        return;
      }

      isContextPreferenceUpdating.value = true;
      try {
        if (!enabled) {
          await deleteMessagesByConversationAndType(
            conversationId.value,
            "page_context",
          );
          messages.value = messages.value.filter(
            (msg) =>
              msg.metadata?.type !== "page_context" && msg.role !== "system",
          );
        } else if (!hasPageContextMessage() && pageContent.value) {
          const contextMessage = buildPageContextMessage(conversationId.value);
          if (contextMessage) {
            await saveMessage(contextMessage);
            messages.value = [...messages.value, contextMessage];
          }
        }

        await persistSendContextPreference(enabled);
        await checkContext();
      } finally {
        isContextPreferenceUpdating.value = false;
      }
    }

    function handleCompositionStart() {
      isComposing.value = true;
    }

    function handleCompositionEnd() {
      isComposing.value = false;
    }

    function hasToolInvocationDetails(metadata) {
      return (
        Array.isArray(metadata?.toolCallDetails) &&
        metadata.toolCallDetails.length > 0
      );
    }

    function formatArgumentsForDisplay(value) {
      if (!value) return "";
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }

    function openToolResponse(message) {
      toolResponseViewer.visible = true;
      toolResponseViewer.title = message.metadata?.toolName || "工具响应详情";
      toolResponseViewer.content = message.content || "";
      toolResponseViewer.toolName = message.metadata?.toolName || "工具响应";
      toolResponseViewer.timestamp = message.timestamp || "";
      toolResponseViewer.args = formatArgumentsForDisplay(
        message.metadata?.toolArgs,
      );
      toolResponseViewer.invocationDetails = [];
    }

    function closeToolResponse() {
      toolResponseViewer.visible = false;
      toolResponseViewer.title = "";
      toolResponseViewer.content = "";
      toolResponseViewer.toolName = "";
      toolResponseViewer.timestamp = "";
      toolResponseViewer.args = "";
      toolResponseViewer.invocationDetails = [];
    }

    function openToolInvocationDetails(message) {
      if (!hasToolInvocationDetails(message?.metadata)) return;
      const details = message.metadata.toolCallDetails.map((detail, index) => ({
        id: detail.id || `tool-${index + 1}`,
        name: detail.name || `工具 ${index + 1}`,
        arguments: formatArgumentsForDisplay(detail.arguments) || "（无参数）",
      }));
      toolResponseViewer.visible = true;
      toolResponseViewer.toolName = "工具调用参数";
      toolResponseViewer.title = "工具调用参数";
      toolResponseViewer.timestamp = message.timestamp || "";
      toolResponseViewer.content = "";
      toolResponseViewer.args = "";
      toolResponseViewer.invocationDetails = details;
    }

    function handleStreamStartEvent(data) {
      if (
        !data ||
        data.conversationId !== conversationId.value ||
        !data.message
      ) {
        return;
      }
      resetActiveStream();
      const streamId = data.message.id || data.streamId;
      if (!streamId) {
        return;
      }
      activeStream.id = streamId;
      activeStream.content = "";
      activeStream.reasoning = "";
      activeStream.timestamp =
        data.message.timestamp || new Date().toISOString();
      activeStream.metadata = {
        ...(data.message.metadata || {}),
        streaming: true,
      };
      nextTick(() => {
        scrollToBottom();
      });
    }

    function handleStreamChunkEvent(data) {
      if (
        !data ||
        data.conversationId !== conversationId.value ||
        !data.streamId ||
        activeStream.id !== data.streamId
      ) {
        return;
      }
      if (typeof data.delta === "string") {
        activeStream.content = data.delta;
      }
      if (typeof data.reasoning === "string") {
        activeStream.reasoning = data.reasoning;
      }
      nextTick(() => {
        scrollToBottom();
      });
    }

    function handleStreamCompleteEvent(data) {
      if (
        !data ||
        data.conversationId !== conversationId.value ||
        !data.streamId ||
        activeStream.id !== data.streamId
      ) {
        return;
      }

      let finalMessage = data.message;
      if (!finalMessage) {
        finalMessage = {
          id: data.streamId,
          conversationId: conversationId.value,
          role: "assistant",
          content: data.content ?? activeStream.content ?? "",
          timestamp: activeStream.timestamp || new Date().toISOString(),
          metadata: {
            ...(activeStream.metadata || {}),
            streaming: false,
            ...(data.metadata || {}),
          },
        };
      }
      const mergedMetadata = {
        ...(finalMessage.metadata || {}),
        streaming: false,
      };
      const reasoningText =
        data.reasoning ||
        data.metadata?.reasoning ||
        mergedMetadata.reasoning ||
        activeStream.reasoning ||
        "";
      if (reasoningText) {
        mergedMetadata.reasoning = reasoningText;
        finalMessage.reasoning_content =
          finalMessage.reasoning_content || reasoningText;
      }
      finalMessage.metadata = mergedMetadata;

      if (data.metadata?.toolNames && !finalMessage.metadata?.toolNames) {
        finalMessage.metadata = {
          ...(finalMessage.metadata || {}),
          toolNames: data.metadata.toolNames,
        };
      }
      if (
        data.metadata?.toolCallDetails &&
        !finalMessage.metadata?.toolCallDetails
      ) {
        finalMessage.metadata = {
          ...(finalMessage.metadata || {}),
          toolCallDetails: data.metadata.toolCallDetails,
          hasToolCalls: data.metadata.toolCallDetails.length > 0,
        };
      }
      if (
        Array.isArray(finalMessage.metadata?.toolNames) &&
        finalMessage.metadata.toolNames.length > 0
      ) {
        finalMessage.metadata.hasToolCalls = true;
      }

      const messageToAppend = {
        ...finalMessage,
        metadata: { ...(finalMessage.metadata || {}) },
      };
      resetActiveStream();
      messages.value.push(messageToAppend);
      nextTick(() => {
        scrollToBottom();
      });
      checkContext();
    }

    function handleStreamErrorEvent(data) {
      if (
        !data ||
        data.conversationId !== conversationId.value ||
        !data.streamId ||
        activeStream.id !== data.streamId
      ) {
        return;
      }
      resetActiveStream();
      error.value = data.error ? `AI生成失败: ${data.error}` : "AI生成失败";
    }

    function scrollToBottom() {
      if (messageListRef.value) {
        messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
      }
    }

    function showHistory() {
      view.value = "history";
      resetActiveStream();
      closeAutoInsights();
    }

    function showChat(selectedConv = null) {
      view.value = "chat";
      resetActiveStream();
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
      if (isComposing.value) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        await handleSendMessage();
      }
    }

    function handleInputChange(event) {
      userInput.value = event.target.value;
    }

    function handleMessageClick(event) {
      const anchor = event.target.closest("a");
      if (!anchor) {
        return;
      }
      const href = anchor.getAttribute("href") || "";
      if (!href.startsWith("myz-chunk://")) {
        return;
      }
      event.preventDefault();
      const chunkId = href.replace("myz-chunk://", "");
      const snippet = anchor.getAttribute("title") || anchor.textContent || "";
      handleScrollToCitation(chunkId, snippet);
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
          const incoming = message.data.message;
          if (
            conversationId.value &&
            incoming.conversationId === conversationId.value
          ) {
            messages.value.push(incoming);
            nextTick(() => {
              scrollToBottom();
            });
          }
        }
        // Streaming handlers
        else if (message.type === "myz:aiStreamStart" && message.data) {
          handleStreamStartEvent(message.data);
        } else if (message.type === "myz:aiStreamChunk" && message.data) {
          handleStreamChunkEvent(message.data);
        } else if (message.type === "myz:aiStreamComplete" && message.data) {
          handleStreamCompleteEvent(message.data);
        } else if (message.type === "myz:aiStreamError" && message.data) {
          handleStreamErrorEvent(message.data);
        } else if (
          message.type === "myz:showRelatedHighlights" &&
          Array.isArray(message.payload?.matches)
        ) {
          relatedMatches.value = message.payload.matches;
          view.value = "related";
        }
      };

      chrome.runtime.onMessage.addListener(runtimeListener);
    });

    onBeforeUnmount(() => {
      if (runtimeListener) {
        chrome.runtime.onMessage.removeListener(runtimeListener);
        runtimeListener = null;
      }
      clearPageChunkAnchors();
    });

    async function handleAutoAction() {
      if (!autoAction.value || isLoading.value) return;

      const action = autoAction.value;
      autoAction.value = null; // Clear after processing

      if (action === "summarize" || action === "key_points") {
        await runAutoInsights(action);
        return;
      }

      // Set input based on action type
      if (action === "find_related_logseq") {
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
      <div class="flex h-screen flex-col bg-slate-50 px-4 py-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {view.value === "related" && relatedMatches.value.length ? (
          <div class="flex h-full flex-col gap-3">
            <header class="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
              <div class="flex items-center gap-2">
                <h1 class="text-lg font-semibold">相关标注</h1>
                <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                  {relatedMatches.value.length}
                </span>
              </div>
              <button
                class="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-300"
                onClick={() => {
                  relatedMatches.value = [];
                  view.value = "chat";
                }}
              >
                返回助手
              </button>
            </header>
            <div class="flex-1 space-y-3 overflow-auto pr-1">
              {sortedRelatedMatches.value.map((item) => (
                <div class="rounded-xl border border-slate-200 bg-white/90 p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                  <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      {item.metadata?.host || item.metadata?.url || "标注"} ·
                      相似度 {((item.score || 0) * 100).toFixed(1)}%
                    </span>
                    {item.metadata?.url ? (
                      <a
                        class="text-indigo-600 hover:underline dark:text-indigo-300"
                        href={item.metadata.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看页面
                      </a>
                    ) : null}
                  </div>
                  <div class="mt-2 whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                    {item.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : view.value === "history" ? (
          <HistoryView
            onSelectConversation={showChat}
            onBack={() => showChat()}
          />
        ) : (
          <>
            <header class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div class="flex items-center gap-2">
                <h1 class="text-lg font-semibold">AI 智能助理</h1>
                {contextInfo.needsCompression && (
                  <span class="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                    ⚠️ {Math.round(contextInfo.percentage)}%
                  </span>
                )}
              </div>
              <div class="flex items-center gap-2">
                <ThemeToggle size="sm" />
                <button
                  class="inline-flex items-center rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200"
                  onClick={showHistory}
                  title="查看对话历史"
                >
                  历史
                </button>
              </div>
            </header>
            {autoInsights.active && autoInsights.loading && (
              <p class="mt-2 text-xs text-indigo-600 dark:text-indigo-300">
                正在生成
                {autoInsights.action === "key_points" ? "要点" : "摘要"}...
              </p>
            )}
            {autoInsights.active &&
              !autoInsights.loading &&
              autoInsights.error && (
                <p class="mt-2 text-xs text-rose-600 dark:text-rose-400">
                  {autoInsights.error}
                </p>
              )}

            <PageContextCard
              title={pageTitle.value}
              url={currentUrl.value}
              sendContext={sendContext.value}
              disabled={
                !conversationId.value || isContextPreferenceUpdating.value
              }
              onToggle={handleContextToggle}
            />

            <section class="mt-4 flex flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              {autoInsights.active &&
              (autoInsights.action === "summarize" ||
                autoInsights.action === "key_points") ? (
                <AutoInsightsPanel
                  state={autoInsights}
                  onClose={closeAutoInsights}
                  onRetry={() => runAutoInsights(autoInsights.action)}
                  onScrollToCitation={handleScrollToCitation}
                />
              ) : (
                <div onClick={handleMessageClick} class="flex h-full flex-col">
                  <ConversationList
                    messages={visibleMessages.value}
                    listRef={messageListRef}
                    onToolDetails={openToolInvocationDetails}
                    onToolResponse={openToolResponse}
                    onSaveAssistant={handleSaveHighlight}
                    isSavingHighlight={isSavingHighlight.value}
                    streaming={activeStream}
                    hasActiveStream={hasActiveStream.value}
                    isLoading={isLoading.value}
                  />
                  <InputComposer
                    value={userInput.value}
                    placeholder={inputPlaceholder.value}
                    disabled={isLoading.value}
                    error={error.value}
                    onInput={handleInputChange}
                    onKeydown={handleKeydown}
                    onCompositionstart={handleCompositionStart}
                    onCompositionend={handleCompositionEnd}
                    onSend={handleSendMessage}
                  />
                </div>
              )}
            </section>

            <SaveHighlightModal
              visible={saveModal.visible}
              aiResponse={saveModal.aiResponse}
              onSave={handleModalSave}
              onClose={handleModalClose}
            />
          </>
        )}
        <ToolResponseModal
          viewer={toolResponseViewer}
          onClose={closeToolResponse}
        />
      </div>
    );
  },
});
