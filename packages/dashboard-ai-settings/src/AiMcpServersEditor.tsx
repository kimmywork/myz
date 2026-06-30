import { parseAiRequestHeaders } from "@myz/shared/aiHeaderUtils"
import { computed, defineComponent, ref, watch } from "vue"
import type { PropType } from "vue"
import ToggleSwitch from "./ToggleSwitch"
import type { McpServerSetting } from "./types"

function stringifyHeaders(headers?: Record<string, string>) {
  if (!headers || typeof headers !== "object") return ""
  return Object.entries(headers)
    .filter(([key]) => typeof key === "string" && key.trim())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${value ?? ""}`.trimEnd())
    .join("\n")
}

function statusDot(server: McpServerSetting) {
  if (server.enabled) return "bg-emerald-500"
  if (server.lastTest?.ok) return "bg-sky-500"
  if (server.lastTest) return "bg-rose-500"
  return "bg-slate-300 dark:bg-slate-600"
}

export default defineComponent({
  name: "AiMcpServersEditor",
  props: {
    servers: { type: Array as PropType<McpServerSetting[]>, required: true },
    onChange: {
      type: Function as PropType<(next: McpServerSetting[]) => void>,
      required: true,
    },
    canTestConnection: { type: Boolean, default: false },
    testingServerId: { type: String as PropType<string | null>, default: null },
    onTestConnection: Function as PropType<(id: string) => void>,
    showStatusDot: { type: Boolean, default: true },
    requireSuccessfulTestToEnable: { type: Boolean, default: false },
    introText: {
      type: String,
      default:
        "连接测试会执行 MCP initialize / tools/list 流程，并显示发现的工具与资源数量。",
    },
    resetLastTestOnConfigChange: { type: Boolean, default: false },
  },
  setup(props) {
    const selectedId = ref<string | null>(null)
    const headerDraftById = ref<Record<string, string>>({})

    const selectedServer = computed(
      () => props.servers.find((server) => server.id === selectedId.value) || null,
    )

    const canEnableSelected = computed(() => {
      if (!props.requireSuccessfulTestToEnable) {
        return true
      }
      return Boolean(selectedServer.value?.lastTest?.ok)
    })

    watch(
      () => props.servers,
      (servers) => {
        if (selectedId.value && servers.some((server) => server.id === selectedId.value)) {
          return
        }
        selectedId.value = servers[0]?.id || null
      },
      { deep: true, immediate: true },
    )

    watch(
      () => selectedServer.value?.id,
      (id) => {
        if (!id) return
        if (typeof headerDraftById.value[id] === "string") return
        const server = props.servers.find((entry) => entry.id === id)
        headerDraftById.value = {
          ...headerDraftById.value,
          [id]: stringifyHeaders(server?.headers),
        }
      },
      { immediate: true },
    )

    function updateServer(id: string, patch: Partial<McpServerSetting>) {
      props.onChange(
        props.servers.map((server) =>
          server.id === id ? { ...server, ...patch } : server,
        ),
      )
    }

    function maybeInvalidateServerTest(id: string) {
      if (!props.resetLastTestOnConfigChange) {
        return
      }
      const current = props.servers.find((server) => server.id === id)
      if (!current || (!current.lastTest && !current.enabled)) {
        return
      }
      updateServer(id, { lastTest: null, enabled: false })
    }

    function addServer() {
      const record: McpServerSetting = {
        id: crypto.randomUUID ? crypto.randomUUID() : `mcp_${Date.now()}`,
        name: "MCP Server",
        enabled: false,
        url: "",
        headers: undefined,
        lastTest: null,
      }
      props.onChange([...props.servers, record])
      selectedId.value = record.id
      headerDraftById.value = {
        ...headerDraftById.value,
        [record.id]: "",
      }
    }

    function removeServer(id: string) {
      const next = props.servers.filter((server) => server.id !== id)
      props.onChange(next)
      if (selectedId.value === id) {
        selectedId.value = next[0]?.id || null
      }
    }

    function updateHeaders(id: string, draft: string) {
      headerDraftById.value = {
        ...headerDraftById.value,
        [id]: draft,
      }
      const parsed = parseAiRequestHeaders(draft)
      updateServer(id, {
        headers: Object.keys(parsed).length ? parsed : undefined,
      })
      maybeInvalidateServerTest(id)
    }

    return () => (
      <div class="space-y-4">
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300">
          {props.introText}
        </div>

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
                      onClick={() => {
                        selectedId.value = server.id
                      }}
                    >
                      {props.showStatusDot ? (
                        <span
                          class={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDot(server)}`}
                          aria-hidden="true"
                        ></span>
                      ) : null}
                      <div class="min-w-0">
                        <input
                          class="input h-8 w-full min-w-0 px-2 py-1 text-sm font-semibold"
                          value={server.name || ""}
                          placeholder="服务器名称"
                          onClick={(event) => event.stopPropagation()}
                          onInput={(event) =>
                            updateServer(server.id, {
                              name: (event.target as HTMLInputElement).value,
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
                    {props.canTestConnection ? (
                      <button
                        type="button"
                        class="btn btn-small whitespace-nowrap"
                        disabled={
                          props.testingServerId === selectedServer.value.id ||
                          !selectedServer.value.url.trim()
                        }
                        onClick={() => props.onTestConnection?.(selectedServer.value!.id)}
                      >
                        {props.testingServerId === selectedServer.value.id
                          ? "测试中…"
                          : "测试连接"}
                      </button>
                    ) : null}
                    <span class="text-sm text-slate-700 dark:text-slate-200">
                      启用
                    </span>
                    <ToggleSwitch
                      checked={selectedServer.value.enabled}
                      disabled={!canEnableSelected.value}
                      ariaLabel="启用 MCP 服务器"
                      onChange={(event) =>
                        updateServer(selectedServer.value!.id, {
                          enabled: (event.target as HTMLInputElement).checked,
                        })
                      }
                    />
                  </div>
                </div>

                {selectedServer.value.lastTest ? (
                  <div
                    class={[
                      "rounded-xl border p-3 text-xs",
                      selectedServer.value.lastTest.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                        : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100",
                    ].join(" ")}
                  >
                    <div class="font-medium">
                      {selectedServer.value.lastTest.ok
                        ? "最近一次连接测试成功"
                        : "最近一次连接测试失败"}
                    </div>
                    <div class="mt-1 break-words">
                      {selectedServer.value.lastTest.message}
                    </div>
                    <div class="mt-1 opacity-80">
                      时间：{selectedServer.value.lastTest.testedAt}
                    </div>
                  </div>
                ) : null}

                <label class="field">
                  <span>服务器 URL</span>
                  <input
                    type="url"
                    value={selectedServer.value.url}
                    placeholder="http://localhost:3000/mcp"
                    onInput={(event) => {
                      updateServer(selectedServer.value!.id, {
                        url: (event.target as HTMLInputElement).value,
                      })
                      maybeInvalidateServerTest(selectedServer.value!.id)
                    }}
                  />
                </label>

                <label class="field">
                  <span>自定义 Headers</span>
                  <textarea
                    rows="4"
                    value={headerDraftById.value[selectedServer.value.id] ?? ""}
                    placeholder={"x-api-key: xxx\nAuthorization: Bearer ..."}
                    onInput={(event) =>
                      updateHeaders(
                        selectedServer.value!.id,
                        (event.target as HTMLTextAreaElement).value,
                      )
                    }
                  ></textarea>
                  <small class="help-text">每行一个：Header: value</small>
                </label>
              </div>
            ) : (
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/60">
                <p class="text-sm text-slate-500">请选择或添加 MCP 服务器</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  },
})
