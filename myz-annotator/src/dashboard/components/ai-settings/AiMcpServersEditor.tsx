import { computed, defineComponent, ref, watch } from "vue";
import type { PropType } from "vue";
import ToggleSwitch from "../ToggleSwitch.jsx";
import type { McpServerSetting } from "@/background/settings.js";
import { parseAiRequestHeaders } from "@/shared/aiHeaderUtils.js";
import { sendMessage } from "@/shared/messaging.js";
import type { TestMcpConnectionMessageResult } from "@/background/messages/ai";

function stringifyHeaders(headers?: Record<string, string>) {
  if (!headers || typeof headers !== "object") return "";
  return Object.entries(headers)
    .filter(([key]) => typeof key === "string" && key.trim())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}: ${value ?? ""}`.trimEnd())
    .join("\n");
}

function statusDot(server: McpServerSetting) {
  if (server.enabled) return "bg-emerald-500";
  if (server.lastTest?.ok) return "bg-sky-500";
  if (server.lastTest) return "bg-rose-500";
  return "bg-slate-300 dark:bg-slate-600";
}

export default defineComponent({
  name: "AiMcpServersEditor",
  props: {
    servers: { type: Array as PropType<McpServerSetting[]>, required: true },
    onChange: {
      type: Function as PropType<(next: McpServerSetting[]) => void>,
      required: true,
    },
  },
  setup(props) {
    const selectedId = ref<string | null>(null);
    const headerDraftById = ref<Record<string, string>>({});
    const isTestingId = ref<string | null>(null);
    const testMessage = ref("");

    const selectedServer = computed(
      () =>
        props.servers.find((server) => server.id === selectedId.value) || null,
    );

    const canEnableSelected = computed(() =>
      Boolean(selectedServer.value?.lastTest?.ok),
    );

    watch(
      () => props.servers,
      (servers) => {
        if (
          selectedId.value &&
          servers.some((s) => s.id === selectedId.value)
        ) {
          return;
        }
        selectedId.value = servers[0]?.id || null;
      },
      { deep: true, immediate: true },
    );

    watch(
      () => selectedServer.value?.id,
      (id) => {
        if (!id) return;
        if (typeof headerDraftById.value[id] === "string") return;
        const server = props.servers.find((s) => s.id === id);
        headerDraftById.value = {
          ...headerDraftById.value,
          [id]: stringifyHeaders(server?.headers),
        };
      },
      { immediate: true },
    );

    const updateServer = (id: string, patch: Partial<McpServerSetting>) => {
      props.onChange(
        props.servers.map((server) =>
          server.id === id
            ? ({ ...server, ...patch } as McpServerSetting)
            : server,
        ),
      );
    };

    const invalidateServerTest = (id: string) => {
      const current = props.servers.find((s) => s.id === id);
      if (!current) return;
      if (!current.lastTest && !current.enabled) return;
      updateServer(id, { lastTest: null, enabled: false });
    };

    const addServer = () => {
      const record: McpServerSetting = {
        id: crypto.randomUUID ? crypto.randomUUID() : `mcp_${Date.now()}`,
        name: "MCP Server",
        enabled: false,
        url: "",
        headers: undefined,
        lastTest: null,
      };
      props.onChange([...props.servers, record]);
      selectedId.value = record.id;
      headerDraftById.value = {
        ...headerDraftById.value,
        [record.id]: "",
      };
    };

    const removeServer = (id: string) => {
      const next = props.servers.filter((server) => server.id !== id);
      props.onChange(next);
      if (selectedId.value === id) {
        selectedId.value = next[0]?.id || null;
      }
    };

    const testConnection = async () => {
      const server = selectedServer.value;
      if (!server) return;
      if (!server.url || !server.url.trim()) {
        testMessage.value = "请输入 MCP Server URL";
        return;
      }
      isTestingId.value = server.id;
      testMessage.value = "";

      const headerText = headerDraftById.value[server.id] || "";
      const parsedHeaders = parseAiRequestHeaders(headerText);

      try {
        const result = await sendMessage<
          { serverConfig: { url: string; headers?: Record<string, string> } },
          TestMcpConnectionMessageResult
        >("myz:testMcpConnection", {
          serverConfig: {
            url: server.url.trim(),
            headers: Object.keys(parsedHeaders).length
              ? parsedHeaders
              : undefined,
          },
        });

        const ok = Boolean(result?.success);
        const message = ok
          ? `连接成功（tools: ${(result?.tools || []).length}）`
          : result?.error || "连接失败";
        testMessage.value = message;

        updateServer(server.id, {
          lastTest: { ok, message, testedAt: new Date().toISOString() },
          enabled: ok ? server.enabled : false,
          headers:
            ok && Object.keys(parsedHeaders).length
              ? parsedHeaders
              : server.headers,
        });

        if (ok) {
          headerDraftById.value = {
            ...headerDraftById.value,
            [server.id]: stringifyHeaders(parsedHeaders),
          };
        }
      } catch (error) {
        const message = (error as Error).message;
        testMessage.value = message;
        updateServer(server.id, {
          lastTest: { ok: false, message, testedAt: new Date().toISOString() },
          enabled: false,
        });
      } finally {
        isTestingId.value = null;
      }
    };

    return () => (
      <div class="space-y-4">
        <div class="grid gap-4 md:grid-cols-3">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-slate-700 dark:text-slate-200">
                MCP 服务器列表
              </span>
              <button
                type="button"
                class="btn-small btn-primary whitespace-nowrap text-white"
                onClick={addServer}
              >
                添加
              </button>
            </div>

            {props.servers.length === 0 ? (
              <p class="text-xs text-slate-500">暂无 MCP 服务器</p>
            ) : (
              <div class="space-y-2">
                {props.servers.map((server) => (
                  <div
                    key={server.id}
                    class={[
                      "flex items-center gap-2 rounded-xl border px-3 py-2 transition",
                      server.id === selectedId.value
                        ? "border-indigo-400 bg-indigo-50 dark:border-indigo-400/60 dark:bg-indigo-500/10"
                        : "border-slate-200 hover:border-indigo-300 dark:border-white/10 dark:hover:border-indigo-400/40",
                    ].join(" ")}
                  >
                    <div
                      class="flex min-w-0 flex-1 items-center gap-2"
                      role="button"
                      tabindex={0}
                      onClick={() => (selectedId.value = server.id)}
                    >
                      <span
                        class={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDot(server)}`}
                        aria-hidden="true"
                      ></span>
                      <div class="min-w-0">
                        <input
                          class="input h-8 w-full min-w-0 px-2 py-1 text-sm font-semibold"
                          value={server.name || ""}
                          placeholder="服务器名称"
                          onClick={(e) => e.stopPropagation()}
                          onInput={(e) =>
                            updateServer(server.id, {
                              name: (e.target as HTMLInputElement).value,
                            })
                          }
                        />
                        <div class="text-xs text-slate-500 dark:text-slate-400">
                          {server.enabled ? "已启用" : "已禁用"}
                          {server.url ? ` · ${server.url}` : ""}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      class="btn btn-small whitespace-nowrap"
                      onClick={() => removeServer(server.id)}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div class="md:col-span-2 space-y-3">
            {selectedServer.value ? (
              <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
                <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedServer.value.name || "未命名 MCP 服务器"}
                    </div>
                    <div class="truncate text-xs text-slate-500 dark:text-slate-400">
                      {selectedServer.value.url || "未配置 URL"}
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="text-sm text-slate-700 dark:text-slate-200">
                      启用
                    </span>
                    <ToggleSwitch
                      checked={selectedServer.value.enabled}
                      disabled={!canEnableSelected.value}
                      ariaLabel="启用 MCP 服务器"
                      onChange={(e) =>
                        updateServer(selectedServer.value!.id, {
                          enabled: (e.target as HTMLInputElement).checked,
                        })
                      }
                    />
                  </div>
                </div>

                <label class="field">
                  <span>服务器 URL</span>
                  <input
                    type="url"
                    value={selectedServer.value.url}
                    placeholder="http://localhost:3000/mcp"
                    onInput={(e) =>
                      (() => {
                        updateServer(selectedServer.value!.id, {
                          url: (e.target as HTMLInputElement).value,
                        });
                        invalidateServerTest(selectedServer.value!.id);
                      })()
                    }
                  />
                </label>

                <label class="field">
                  <span>自定义 Headers</span>
                  <textarea
                    rows="4"
                    value={headerDraftById.value[selectedServer.value.id] ?? ""}
                    placeholder={"x-api-key: xxx\nAuthorization: Bearer ..."}
                    onInput={(e) => {
                      const text = (e.target as HTMLTextAreaElement).value;
                      headerDraftById.value = {
                        ...headerDraftById.value,
                        [selectedServer.value!.id]: text,
                      };
                      invalidateServerTest(selectedServer.value!.id);
                    }}
                  ></textarea>
                  <small class="help-text">每行一个：Header: value</small>
                </label>

                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    class="btn btn-small btn-primary whitespace-nowrap text-white"
                    disabled={
                      isTestingId.value === selectedServer.value.id ||
                      !selectedServer.value.url
                    }
                    onClick={testConnection}
                  >
                    {isTestingId.value === selectedServer.value.id
                      ? "测试中…"
                      : "测试连接"}
                  </button>
                  <div class="text-xs">
                    {selectedServer.value.lastTest ? (
                      <span
                        class={[
                          selectedServer.value.lastTest.ok
                            ? "text-emerald-600"
                            : "text-rose-600",
                        ].join(" ")}
                      >
                        {selectedServer.value.lastTest.ok
                          ? "测试通过"
                          : "测试失败"}{" "}
                        · {selectedServer.value.lastTest.message}
                      </span>
                    ) : testMessage.value ? (
                      <span class="text-rose-600">{testMessage.value}</span>
                    ) : (
                      <span class="text-slate-500">未测试，无法启用</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/60">
                <p class="text-sm text-slate-500">请选择或添加 MCP 服务器</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
});
