import {
  defineComponent,
  ref,
  reactive,
  computed,
  watch,
  onMounted,
} from "vue";

export default defineComponent({
  name: "AiSettings",
  props: {
    settings: {
      type: Object,
      required: true,
    },
    onSave: {
      type: Function,
      required: true,
    },
    onTestConnection: {
      type: Function,
      required: true,
    },
    statusRef: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const aiForm = reactive({
      aiAssistantEnabled: false,
      aiApiEndpoint: "",
      aiApiKey: "",
      aiModel: "gpt-4",
      aiCustomModel: "",
      aiContextSize: "32K",
      aiMaxTokens: 4000,
      aiMcpServers: [],
    });

    const isTesting = ref(false);
    const testResult = ref("");
    const testSuccess = ref(false);
    const showApiKey = ref(false);
    const showCustomModel = ref(false);
    const showMcpForm = ref(false);
    const mcpForm = reactive({
      name: "",
      url: "",
      enabled: true,
    });
    const editingMcpServerId = ref(null);

    const aiModels = [
      { value: "gpt-4", label: "GPT-4" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
      { value: "gemini-pro", label: "Gemini Pro" },
      { value: "deepseek-chat", label: "DeepSeek Chat" },
      { value: "moonshot-v1-8k", label: "Kimi Moonshot V1 8K" },
      { value: "moonshot-v1-32k", label: "Kimi Moonshot V1 32K" },
      { value: "moonshot-v1-128k", label: "Kimi Moonshot V1 128K" },
      { value: "custom", label: "自定义模型..." },
    ];

    const contextSizes = [
      { value: "8K", label: "8K (约 8000 tokens)", tokens: 8000 },
      { value: "32K", label: "32K (约 32000 tokens)", tokens: 32000 },
      { value: "128K", label: "128K (约 128000 tokens)", tokens: 128000 },
      { value: "256K", label: "256K (约 256000 tokens)", tokens: 256000 },
      { value: "1M", label: "1M (约 1000000 tokens)", tokens: 1000000 },
    ];

    const hasMcpServers = computed(() => {
      return (
        props.settings.aiMcpServers && props.settings.aiMcpServers.length > 0
      );
    });

    const mcpServerCount = computed(() => {
      return props.settings.aiMcpServers?.filter((s) => s.enabled).length || 0;
    });

    function setFormFromSettings() {
      aiForm.aiAssistantEnabled = props.settings.aiAssistantEnabled || false;
      aiForm.aiApiEndpoint = props.settings.aiApiEndpoint || "";
      aiForm.aiApiKey = props.settings.aiApiKey || "";
      aiForm.aiModel = props.settings.aiModel || "gpt-4";
      aiForm.aiCustomModel = props.settings.aiCustomModel || "";
      aiForm.aiContextSize = props.settings.aiContextSize || "32K";
      aiForm.aiMaxTokens = props.settings.aiMaxTokens || 4000;
      aiForm.aiMcpServers = Array.isArray(props.settings.aiMcpServers)
        ? [...props.settings.aiMcpServers]
        : [];

      // Check if current model is custom
      showCustomModel.value = aiForm.aiModel === "custom";
    }

    function getTokensForContextSize(size) {
      const mapping = {
        "8K": 8000,
        "32K": 32000,
        "128K": 128000,
        "256K": 256000,
        "1M": 1000000,
      };
      return mapping[size] || 32000;
    }

    async function handleToggle(event) {
      const enabled = event.target.checked;
      aiForm.aiAssistantEnabled = enabled;

      // Check if statusRef is properly passed
      if (!props.statusRef) {
        console.error("statusRef is not provided to AiSettings component");
      }

      // Save immediately when toggling
      try {
        if (props.statusRef) {
          props.statusRef.value = "保存中...";
        }
        await props.onSave(aiForm);
        setFormFromSettings();
        if (props.statusRef) {
          props.statusRef.value = "设置已保存";
          setTimeout(() => {
            if (props.statusRef) props.statusRef.value = "";
          }, 3000);
        }
      } catch (error) {
        // Revert toggle on error
        event.target.checked = !enabled;
        aiForm.aiAssistantEnabled = !enabled;
        if (props.statusRef) {
          props.statusRef.value = `保存失败: ${error.message}`;
        }
        // Also log to console for debugging
        console.error("Toggle save failed:", error);
      }
    }

    async function handleModelChange(event) {
      const model = event.target.value;
      aiForm.aiModel = model;
      showCustomModel.value = model === "custom";
    }

    async function handleContextSizeChange(event) {
      const size = event.target.value;
      aiForm.aiContextSize = size;
      aiForm.aiMaxTokens = getTokensForContextSize(size);
    }

    async function handleSave() {
      try {
        if (props.statusRef) {
          props.statusRef.value = "保存中...";
        }
        await props.onSave(aiForm);
        setFormFromSettings();
        if (props.statusRef) {
          props.statusRef.value = "设置已保存";
          setTimeout(() => {
            if (props.statusRef) props.statusRef.value = "";
          }, 3000);
        }
      } catch (error) {
        if (props.statusRef) {
          props.statusRef.value = `保存失败: ${error.message}`;
        }
        console.error("Save failed:", error);
      }
    }

    async function handleTestConnection() {
      if (!aiForm.aiAssistantEnabled) {
        testResult.value = "请先启用 AI Assistant";
        testSuccess.value = false;
        return;
      }

      if (!aiForm.aiApiEndpoint || !aiForm.aiApiKey) {
        testResult.value = "请输入 API 地址和密钥";
        testSuccess.value = false;
        return;
      }

      isTesting.value = true;
      testResult.value = "";

      try {
        const result = await props.onTestConnection(aiForm);

        if (result.success) {
          testResult.value = `✓ 连接成功! 响应: "${result.response || "OK"}"`;
          testSuccess.value = true;
        } else {
          testResult.value = `✗ 连接失败: ${result.error || "未知错误"}`;
          testSuccess.value = false;
        }
      } catch (error) {
        testResult.value = `✗ 测试失败: ${error.message}`;
        testSuccess.value = false;
      } finally {
        isTesting.value = false;
      }
    }

    function handleAddMcpServer() {
      editingMcpServerId.value = null;
      mcpForm.name = "";
      mcpForm.url = "";
      mcpForm.enabled = true;
      showMcpForm.value = true;
    }

    function handleEditMcpServer(server) {
      editingMcpServerId.value = server.id;
      mcpForm.name = server.name;
      mcpForm.url = server.url;
      mcpForm.enabled = server.enabled;
      showMcpForm.value = true;
    }

    function handleRemoveMcpServer(serverId) {
      const index = aiForm.aiMcpServers.findIndex((s) => s.id === serverId);
      if (index >= 0) {
        aiForm.aiMcpServers.splice(index, 1);
      }
    }

    function handleSaveMcpServer() {
      if (!mcpForm.name || !mcpForm.url) {
        alert("请填写完整的服务器信息");
        return;
      }

      if (editingMcpServerId.value) {
        // Update existing server
        const server = aiForm.aiMcpServers.find(
          (s) => s.id === editingMcpServerId.value,
        );
        if (server) {
          server.name = mcpForm.name;
          server.url = mcpForm.url;
          server.enabled = mcpForm.enabled;
        }
      } else {
        // Add new server
        const newServer = {
          id: `mcp-${Date.now()}`,
          name: mcpForm.name,
          url: mcpForm.url,
          enabled: mcpForm.enabled,
          headers: {},
        };
        aiForm.aiMcpServers.push(newServer);
      }

      showMcpForm.value = false;
      editingMcpServerId.value = null;
    }

    function handleCancelMcpForm() {
      showMcpForm.value = false;
      editingMcpServerId.value = null;
    }

    onMounted(() => {
      // Initial load
      setFormFromSettings();
    });

    // Watch for settings changes (e.g., when loaded asynchronously)
    watch(
      () => props.settings,
      () => {
        setFormFromSettings();
      },
      { deep: true },
    );

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>AI Assistant 智能助理</h3>
          <label class="toggle">
            <input
              type="checkbox"
              checked={aiForm.aiAssistantEnabled}
              onChange={handleToggle}
            />
            <span>启用智能助理</span>
          </label>
        </div>

        <div
          class={
            "settings__fields" +
            (aiForm.aiAssistantEnabled ? "" : " is-disabled")
          }
        >
          <p class="settings__hint">
            配置 AI 智能助理，通过右键菜单快速分析网页内容。
          </p>

          <label class="field">
            <span>API 地址</span>
            <input
              type="url"
              placeholder="https://api.openai.com/v1/chat/completions"
              disabled={!aiForm.aiAssistantEnabled}
              value={aiForm.aiApiEndpoint}
              onInput={(e) => (aiForm.aiApiEndpoint = e.target.value)}
            />
          </label>

          <label class="field">
            <span>API 密钥</span>
            <div style="position: relative;">
              <input
                type={showApiKey.value ? "text" : "password"}
                placeholder="sk-..."
                disabled={!aiForm.aiAssistantEnabled}
                value={aiForm.aiApiKey}
                onInput={(e) => (aiForm.aiApiKey = e.target.value)}
                style="padding-right: 40px;"
              />
              <button
                type="button"
                onClick={() => (showApiKey.value = !showApiKey.value)}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px",
                  fontSize: "16px",
                }}
                disabled={!aiForm.aiAssistantEnabled}
              >
                {showApiKey.value ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
          </label>

          <label class="field">
            <span>AI 模型</span>
            <select
              disabled={!aiForm.aiAssistantEnabled}
              value={aiForm.aiModel}
              onChange={handleModelChange}
            >
              {aiModels.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>

          {showCustomModel.value && (
            <label class="field">
              <span>自定义模型名称</span>
              <input
                type="text"
                placeholder="输入自定义模型名称"
                disabled={!aiForm.aiAssistantEnabled}
                value={aiForm.aiCustomModel}
                onInput={(e) => (aiForm.aiCustomModel = e.target.value)}
              />
              <small class="help-text">
                当选择"自定义模型"时，请在此输入完整的模型名称
              </small>
            </label>
          )}

          <label class="field">
            <span>Context 大小</span>
            <select
              disabled={!aiForm.aiAssistantEnabled}
              value={aiForm.aiContextSize}
              onChange={handleContextSizeChange}
            >
              {contextSizes.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </select>
          </label>

          <div class="field">
            <span>MCP 服务器</span>
            {aiForm.aiMcpServers.length === 0 ? (
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  margin: "0 0 8px 0",
                }}
              >
                未配置MCP服务器
              </p>
            ) : (
              aiForm.aiMcpServers.map((server) => (
                <div
                  key={server.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    marginBottom: "6px",
                    backgroundColor: "var(--bg-secondary)",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: "13px",
                        marginBottom: "2px",
                      }}
                    >
                      {server.name}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {server.url}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginLeft: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        backgroundColor: server.enabled ? "#10b981" : "#6b7280",
                        color: "white",
                        borderRadius: "10px",
                        fontWeight: 500,
                      }}
                    >
                      {server.enabled ? "启用" : "禁用"}
                    </span>
                    <button
                      type="button"
                      class="btn btn-small"
                      disabled={!aiForm.aiAssistantEnabled}
                      onClick={() => handleEditMcpServer(server)}
                      style={{ padding: "2px 8px", fontSize: "11px" }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      class="btn btn-small"
                      disabled={!aiForm.aiAssistantEnabled}
                      onClick={() => handleRemoveMcpServer(server.id)}
                      style={{ padding: "2px 8px", fontSize: "11px" }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
            {showMcpForm.value && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "var(--bg-secondary)",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  marginBottom: "12px",
                }}
              >
                <h4 style={{ margin: "0 0 12px 0", fontSize: "14px" }}>
                  {editingMcpServerId.value ? "编辑MCP服务器" : "添加MCP服务器"}
                </h4>
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      marginBottom: "4px",
                      fontWeight: 500,
                    }}
                  >
                    服务器名称
                  </label>
                  <input
                    type="text"
                    placeholder="例如: LogSeq服务器"
                    value={mcpForm.name}
                    onInput={(e) => (mcpForm.name = e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      fontSize: "13px",
                    }}
                    disabled={!aiForm.aiAssistantEnabled}
                  />
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      marginBottom: "4px",
                      fontWeight: 500,
                    }}
                  >
                    服务器URL
                  </label>
                  <input
                    type="url"
                    placeholder="例如: http://127.0.0.1:61775"
                    value={mcpForm.url}
                    onInput={(e) => (mcpForm.url = e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      fontSize: "13px",
                    }}
                    disabled={!aiForm.aiAssistantEnabled}
                  />
                </div>
                <div
                  style={{
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={mcpForm.enabled}
                    onChange={(e) => (mcpForm.enabled = e.target.checked)}
                    disabled={!aiForm.aiAssistantEnabled}
                    id="mcp-enabled"
                  />
                  <label
                    for="mcp-enabled"
                    style={{ marginLeft: "6px", fontSize: "13px" }}
                  >
                    启用此服务器
                  </label>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    class="btn btn-secondary"
                    onClick={handleCancelMcpForm}
                    disabled={!aiForm.aiAssistantEnabled}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary"
                    onClick={handleSaveMcpServer}
                    disabled={!aiForm.aiAssistantEnabled}
                  >
                    {editingMcpServerId.value ? "保存" : "添加"}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              class="btn btn-small"
              disabled={!aiForm.aiAssistantEnabled}
              onClick={handleAddMcpServer}
              style={{ width: "100%" }}
            >
              添加MCP服务器
            </button>
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                marginTop: "4px",
              }}
            >
              MCP服务器允许AI调用外部工具（如LogSeq搜索）
            </p>
          </div>

          <div class="settings__actions">
            <button
              class="btn btn-primary"
              type="button"
              disabled={
                !aiForm.aiAssistantEnabled ||
                !aiForm.aiApiEndpoint ||
                !aiForm.aiApiKey
              }
              onClick={handleSave}
            >
              保存设置
            </button>

            <button
              class="btn"
              type="button"
              disabled={
                !aiForm.aiAssistantEnabled ||
                !aiForm.aiApiEndpoint ||
                !aiForm.aiApiKey ||
                isTesting.value
              }
              onClick={handleTestConnection}
              style={{ marginLeft: "8px" }}
            >
              {isTesting.value ? "测试中..." : "测试连接"}
            </button>

            <p class="status-line">{props.statusRef.value}</p>
          </div>

          {testResult.value && (
            <p
              class={`test-result status-line ${testSuccess.value ? "status-line--success" : "status-line--error"}`}
            >
              {testResult.value}
            </p>
          )}
        </div>
      </section>
    );
  },
});
