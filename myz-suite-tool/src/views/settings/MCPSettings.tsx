import { defineComponent, onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import McpServerAddForm from "../../components/settings/mcp/McpServerAddForm";
import McpServerEditItem from "../../components/settings/mcp/McpServerEditItem";

type McpServerConfig = {
  id: string;
  title?: string | null;
  enabled: boolean;
  prefix?: string | null;
  kind: string;
  command?: string | null;
  args: string[];
  running: boolean;
  env: Record<string, string>;
   headers: Record<string, string>;
};

export default defineComponent({
  name: "MCPSettings",
  setup() {
    const configs = ref<McpServerConfig[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const editingId = ref<string | null>(null);
    const editingDraft = ref<{
      id: string;
      kind: string;
      title: string;
      prefix: string;
      enabled: boolean;
      command: string;
      args: string;
      env: string;
      headers: string;
    } | null>(null);
    const showAddForm = ref(false);
    const newDraft = ref({
      id: "",
      title: "",
      prefix: "",
      enabled: true,
      kind: "stdio",
      command: "",
      args: "",
      env: "",
      headers: "",
    });

    const load = async () => {
      loading.value = true;
      error.value = null;
      try {
        const result = await invoke<McpServerConfig[]>("mcp_get_config");
        configs.value = result;
      } catch (e) {
        console.error("failed to load MCP config", e);
        error.value = "加载 MCP 配置失败";
        configs.value = [];
      } finally {
        loading.value = false;
      }
    };

    onMounted(load);

    const startEdit = (mcp: McpServerConfig) => {
      editingId.value = mcp.id;
      const envLines = Object.entries(mcp.env ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
      const headerLines = Object.entries(mcp.headers ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      editingDraft.value = {
        id: mcp.id,
        kind: mcp.kind,
        title: mcp.title ?? "",
        prefix: mcp.prefix ?? "",
        enabled: mcp.enabled,
        command: mcp.command ?? "",
        args: mcp.args.join(" "),
        env: envLines,
        headers: headerLines,
      };
    };

    const cancelEdit = () => {
      editingId.value = null;
      editingDraft.value = null;
    };

    const parseKeyValueLines = (
      text: string,
      separator: string
    ): Record<string, string> => {
      const map: Record<string, string> = {};
      text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .forEach((line) => {
          const idx = line.indexOf(separator);
          if (idx > 0) {
            const key = line.slice(0, idx).trim();
            const value = line.slice(idx + separator.length).trim();
            if (key) map[key] = value;
          }
        });
      return map;
    };

    const parseEnv = (envText: string): Record<string, string> =>
      parseKeyValueLines(envText, "=");

    const parseHeaders = (headersText: string): Record<string, string> =>
      parseKeyValueLines(headersText, ":");

    const saveEdit = async (mcp: McpServerConfig) => {
      if (!editingDraft.value) return;
      try {
        const common = {
          id: mcp.id,
          title: editingDraft.value.title.trim() || null,
          enabled: editingDraft.value.enabled,
          prefix: editingDraft.value.prefix.trim() || null,
        };
        const command = editingDraft.value.command.trim() || null;
        const args = editingDraft.value.args
          .split(/\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        const payload =
          mcp.kind === "http"
            ? {
                ...common,
                command,
                args: [] as string[],
                env: {} as Record<string, string>,
                headers: parseHeaders(editingDraft.value.headers),
              }
            : {
                ...common,
                command,
                args,
                env: parseEnv(editingDraft.value.env),
              };
        await invoke("mcp_update_server", { update: payload });
        await load();
        cancelEdit();
      } catch (e) {
        console.error("failed to update MCP server", e);
        error.value = "保存 MCP 配置失败";
      }
    };

    const saveNew = async () => {
      try {
        const trimmedId = newDraft.value.id.trim();
        if (!trimmedId) {
          error.value = "MCP ID 不能为空";
          return;
        }
        const kind = newDraft.value.kind;
        const command = newDraft.value.command.trim() || null;
        const args = newDraft.value.args
          .split(/\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        const payload =
          kind === "http"
            ? {
                id: trimmedId,
                title: newDraft.value.title.trim() || null,
                enabled: newDraft.value.enabled,
                prefix: newDraft.value.prefix.trim() || null,
                kind,
                command,
                args: [] as string[],
                env: {} as Record<string, string>,
                headers: parseHeaders(newDraft.value.headers),
              }
            : {
                id: trimmedId,
                title: newDraft.value.title.trim() || null,
                enabled: newDraft.value.enabled,
                prefix: newDraft.value.prefix.trim() || null,
                kind,
                command,
                args,
                env: parseEnv(newDraft.value.env),
              };
        await invoke("mcp_add_server", { new: payload });
        showAddForm.value = false;
        newDraft.value = {
          id: "",
          title: "",
          prefix: "",
          enabled: true,
          kind: "stdio",
          command: "",
          args: "",
          env: "",
          headers: "",
        };
        await load();
      } catch (e) {
        console.error("failed to add MCP server", e);
        error.value = "新增 MCP 服务失败";
      }
    };

    return () => (
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-medium text-gray-900">MCP 管理</h3>
          <div class="flex items-center space-x-2">
            <button
              type="button"
              class="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              onClick={() => {
                showAddForm.value = !showAddForm.value;
              }}
            >
              {showAddForm.value ? "取消添加" : "添加 MCP 服务"}
            </button>
            <button
              type="button"
              class="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              onClick={load}
              disabled={loading.value}
            >
              {loading.value ? "刷新中..." : "刷新"}
            </button>
          </div>
        </div>

        {error.value && (
          <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error.value}
          </div>
        )}

        <McpServerAddForm
          visible={showAddForm.value}
          model={newDraft.value}
          saving={false}
          onSave={saveNew}
          onCancel={() => {
            showAddForm.value = false;
          }}
        />

        <div class="bg-white shadow overflow-hidden sm:rounded-md">
          {configs.value.length === 0 && !loading.value ? (
            <div class="px-4 py-6 text-sm text-gray-500">
              当前没有在配置文件中声明 MCP 服务。
            </div>
          ) : (
            <ul class="divide-y divide-gray-200">
              {configs.value.map((mcp) => (
                <li key={mcp.id}>
                  <McpServerEditItem
                    server={mcp}
                    editing={editingId.value === mcp.id}
                    draft={editingDraft.value}
                    onStartEdit={() => startEdit(mcp)}
                    onSave={() => saveEdit(mcp)}
                    onCancel={cancelEdit}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  },
});
