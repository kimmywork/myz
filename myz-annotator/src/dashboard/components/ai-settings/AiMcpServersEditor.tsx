import { defineComponent, reactive, ref } from "vue"
import type { PropType } from "vue"
import type { McpServerSetting } from "@/background/settings.js"

export default defineComponent({
  name: "AiMcpServersEditor",
  props: {
    servers: { type: Array as PropType<McpServerSetting[]>, required: true },
    onChange: { type: Function as PropType<(next: McpServerSetting[]) => void>, required: true },
  },
  setup(props) {
    const showForm = ref(false)
    const editingId = ref<string | null>(null)
    const form = reactive({
      id: "",
      name: "",
      url: "",
      enabled: true,
    })

    const startAdd = () => {
      editingId.value = null
      form.id = ""
      form.name = ""
      form.url = ""
      form.enabled = true
      showForm.value = true
    }

    const startEdit = (server: McpServerSetting) => {
      editingId.value = server.id
      form.id = server.id
      form.name = server.name
      form.url = server.url
      form.enabled = server.enabled
      showForm.value = true
    }

    const remove = (id: string) => {
      props.onChange(props.servers.filter((s) => s.id !== id))
    }

    const save = () => {
      if (!form.name.trim() || !form.url.trim()) return
      const record: McpServerSetting = {
        id:
          editingId.value ||
          form.id ||
          (crypto.randomUUID ? crypto.randomUUID() : `mcp_${Date.now()}`),
        name: form.name.trim(),
        url: form.url.trim(),
        enabled: Boolean(form.enabled),
        headers: {},
      }

      if (editingId.value) {
        props.onChange(props.servers.map((s) => (s.id === editingId.value ? record : s)))
      } else {
        props.onChange([...props.servers, record])
      }
      showForm.value = false
      editingId.value = null
    }

    return () => (
      <div class="space-y-3">
        {props.servers.length === 0 ? (
          <p class="text-sm text-slate-500">未配置 MCP 服务器</p>
        ) : (
          props.servers.map((server) => (
            <div class="flex items-start justify-between rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/60">
              <div class="min-w-0">
                <div class="font-semibold">{server.name}</div>
                <div class="text-xs text-slate-500">{server.url}</div>
                <div class="mt-1 text-[11px] text-slate-500 flex items-center gap-2">
                  <span
                    class={[
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      server.enabled
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100"
                        : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
                    ].join(" ")}
                  >
                    {server.enabled ? "已启用" : "已禁用"}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="btn btn-small whitespace-nowrap"
                  onClick={() => startEdit(server)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  class="btn btn-small whitespace-nowrap"
                  onClick={() => remove(server.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}

        {showForm.value && (
          <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
            <h4 class="text-sm font-semibold">{editingId.value ? "编辑 MCP 服务器" : "添加 MCP 服务器"}</h4>
            <div class="mt-2 grid gap-3 md:grid-cols-2">
              <label class="field">
                <span>服务器名称</span>
                <input
                  type="text"
                  value={form.name}
                  onInput={(e) => (form.name = (e.target as HTMLInputElement).value)}
                />
              </label>
              <label class="field">
                <span>服务器 URL</span>
                <input
                  type="url"
                  value={form.url}
                  onInput={(e) => (form.url = (e.target as HTMLInputElement).value)}
                />
              </label>
            </div>
            <label class="mt-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => (form.enabled = (e.target as HTMLInputElement).checked)}
              />
              <span>启用此服务器</span>
            </label>
            <div class="mt-3 flex justify-end gap-2">
              <button
                type="button"
                class="btn btn-secondary whitespace-nowrap"
                onClick={() => {
                  showForm.value = false
                  editingId.value = null
                }}
              >
                取消
              </button>
              <button type="button" class="btn btn-primary whitespace-nowrap" onClick={save}>
                {editingId.value ? "保存" : "添加"}
              </button>
            </div>
          </div>
        )}

        <div class="flex items-center justify-between gap-2">
          <button type="button" class="btn btn-small whitespace-nowrap" onClick={startAdd}>
            添加 MCP 服务器
          </button>
          <p class="help-text m-0 text-right">MCP 服务器用于工具调用，与 AI Provider 配置独立。</p>
        </div>
      </div>
    )
  },
})
