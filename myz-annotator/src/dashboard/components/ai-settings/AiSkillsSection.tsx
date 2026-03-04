import { unzipSync, strFromU8 } from "fflate";
import { computed, defineComponent, onMounted, ref } from "vue";
import type { PropType } from "vue";
import type {
  SkillFileRecord,
  SkillImportPayload,
  SkillMetadata,
} from "@/background/ai/skills/types.js";
import type {
  AIProviderSetting,
  AISkillsSettings,
} from "@/background/settings.js";
import { sendMessage } from "@/shared/messaging.js";
import { isRecord } from "@/shared/typeUtils";
import type {
  DeleteSkillMessageResult,
  GetSkillDetailMessageResult,
  ImportSkillsMessageResult,
  ListSkillsMessageResult,
  UpdateSkillEnabledMessageResult,
  UpdateSkillFileMessageResult,
} from "@/background/messages/skills";

const TEXT_EXTENSIONS = new Set([
  "md",
  "txt",
  "json",
  "yaml",
  "yml",
  "js",
  "jsx",
  "ts",
  "tsx",
  "css",
  "html",
  "xml",
  "csv",
  "toml",
]);

function getExtension(path: string) {
  const parts = path.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function isTextFile(path: string, mime?: string) {
  if (mime && mime.startsWith("text/")) return true;
  return TEXT_EXTENSIONS.has(getExtension(path));
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export default defineComponent({
  name: "AiSkillsSection",
  props: {
    providers: { type: Array as PropType<AIProviderSetting[]>, required: true },
    value: { type: Object as PropType<AISkillsSettings>, required: true },
    onChange: {
      type: Function as PropType<(next: AISkillsSettings) => void>,
      required: true,
    },
  },
  setup(props) {
    const skills = ref<SkillMetadata[]>([]);
    const loading = ref(false);
    const status = ref("");
    const editorStatus = ref("");
    const selectedSkillId = ref("");
    const files = ref<SkillFileRecord[]>([]);
    const activePath = ref("");
    const activeContent = ref("");
    const activeEncoding = ref<"utf-8" | "base64">("utf-8");
    const fileDirty = ref(false);
    const zipInputRef = ref<HTMLInputElement | null>(null);
    const folderInputRef = ref<HTMLInputElement | null>(null);

    const options = computed(() => {
      const items: Array<{
        label: string;
        providerId: string;
        modelId: string;
      }> = [];
      props.providers
        .filter((p) => p.enabled && p.lastTest?.ok)
        .forEach((provider) => {
          provider.models
            .filter((m) => m.enabled && m.model)
            .forEach((model) => {
              items.push({
                label: `${provider.name} (${model.model})`,
                providerId: provider.id,
                modelId: model.id,
              });
            });
        });
      return items;
    });

    const isAuto = computed(() => props.value.mode === "auto");
    const missingAutoTarget = computed(
      () => isAuto.value && !props.value.autoSelectorTarget,
    );

    const currentKey = computed(() => {
      const target = props.value.autoSelectorTarget;
      return target ? `${target.providerId}:${target.modelId}` : "";
    });

    const update = (patch: Partial<AISkillsSettings>) => {
      props.onChange({
        ...props.value,
        ...patch,
      });
    };

    const refreshSkills = async () => {
      loading.value = true;
      status.value = "";
      try {
        const result = await sendMessage<undefined, ListSkillsMessageResult>(
          "myz:listSkills",
        );
        skills.value = Array.isArray(result) ? result : [];
      } catch (error) {
        status.value = `加载失败：${(error as Error).message}`;
      } finally {
        loading.value = false;
      }
    };

    const openEditor = async (skillId: string) => {
      editorStatus.value = "";
      try {
        const detail = await sendMessage<
          { skillId?: string },
          GetSkillDetailMessageResult
        >("myz:getSkillDetail", { skillId });
        selectedSkillId.value = detail.skill?.id || skillId;
        files.value = Array.isArray(detail.files) ? detail.files : [];
        const first =
          files.value.find((file) => file.path === "SKILL.md") ||
          files.value[0];
        if (first) {
          activePath.value = first.path;
          activeContent.value = first.content;
          activeEncoding.value = first.encoding;
          fileDirty.value = false;
        }
      } catch (error) {
        editorStatus.value = `读取失败：${(error as Error).message}`;
      }
    };

    const closeEditor = () => {
      selectedSkillId.value = "";
      files.value = [];
      activePath.value = "";
      activeContent.value = "";
      activeEncoding.value = "utf-8";
      fileDirty.value = false;
      editorStatus.value = "";
    };

    const selectFile = (file: SkillFileRecord) => {
      if (!file) return;
      activePath.value = file.path;
      activeContent.value = file.content;
      activeEncoding.value = file.encoding;
      fileDirty.value = false;
      editorStatus.value = "";
    };

    const saveFile = async () => {
      if (
        !selectedSkillId.value ||
        !activePath.value ||
        activeEncoding.value !== "utf-8"
      ) {
        return;
      }
      editorStatus.value = "";
      try {
        await sendMessage<
          {
            skillId?: string;
            path?: string;
            content?: string;
            encoding?: "utf-8" | "base64";
          },
          UpdateSkillFileMessageResult
        >("myz:updateSkillFile", {
          skillId: selectedSkillId.value,
          path: activePath.value,
          content: activeContent.value,
          encoding: activeEncoding.value,
        });
        const updatedFiles = files.value.map((file) =>
          file.path === activePath.value
            ? { ...file, content: activeContent.value }
            : file,
        );
        files.value = updatedFiles;
        fileDirty.value = false;
        editorStatus.value = "已保存";
        await refreshSkills();
      } catch (error) {
        editorStatus.value = `保存失败：${(error as Error).message}`;
      }
    };

    const toggleSkill = async (skillId: string, enabled: boolean) => {
      try {
        await sendMessage<
          { skillId?: string; enabled?: boolean },
          UpdateSkillEnabledMessageResult
        >("myz:updateSkillEnabled", { skillId, enabled });
        await refreshSkills();
      } catch (error) {
        status.value = `更新失败：${(error as Error).message}`;
      }
    };

    const deleteSkill = async (skillId: string) => {
      if (!skillId) return;
      if (!window.confirm(`确认删除 Skill：${skillId}？`)) return;
      try {
        await sendMessage<{ skillId?: string }, DeleteSkillMessageResult>(
          "myz:deleteSkill",
          { skillId },
        );
        if (selectedSkillId.value === skillId) {
          closeEditor();
        }
        await refreshSkills();
      } catch (error) {
        status.value = `删除失败：${(error as Error).message}`;
      }
    };

    const handleImportPayload = async (payloads: SkillImportPayload[]) => {
      if (!payloads.length) return;
      status.value = "";
      try {
        const result = await sendMessage<
          { skills?: SkillImportPayload[] },
          ImportSkillsMessageResult
        >("myz:importSkills", {
          skills: payloads,
        });
        const imported = Array.isArray(result?.imported) ? result.imported : [];
        const errors = Array.isArray(result?.errors) ? result.errors : [];
        const errorText = errors
          .map((item) => {
            if (!isRecord(item)) return "";
            const rootDir =
              typeof item.rootDir === "string" ? item.rootDir : "";
            const message =
              typeof item.message === "string" ? item.message : "";
            if (!message) return "";
            return `${rootDir ? `${rootDir}: ` : ""}${message}`;
          })
          .filter(Boolean)
          .join("；");
        status.value = imported.length
          ? `已导入 ${imported.length} 个 Skill${errorText ? `，${errorText}` : ""}`
          : errorText || "未导入任何 Skill";
        await refreshSkills();
      } catch (error) {
        status.value = `导入失败：${(error as Error).message}`;
      }
    };

    const importFolder = async (filesList: FileList | null) => {
      if (!filesList || filesList.length === 0) return;
      const grouped = new Map<string, SkillImportPayload>();
      const tasks = Array.from(filesList).map(async (file) => {
        const relative = file.webkitRelativePath || file.name;
        const parts = relative.split("/");
        const root = parts.shift() || "";
        const path = parts.join("/");
        if (!path || !root) {
          return;
        }
        const encoding = isTextFile(path, file.type) ? "utf-8" : "base64";
        const content =
          encoding === "utf-8"
            ? await file.text()
            : toBase64(new Uint8Array(await file.arrayBuffer()));
        const entry = grouped.get(root) || { rootDir: root, files: [] };
        entry.files.push({ path, content, encoding });
        grouped.set(root, entry);
      });
      await Promise.all(tasks);
      await handleImportPayload(Array.from(grouped.values()));
    };

    const importZip = async (file: File | null) => {
      if (!file) return;
      const buffer = new Uint8Array(await file.arrayBuffer());
      const entries = unzipSync(buffer);
      const grouped = new Map<string, SkillImportPayload>();
      Object.entries(entries).forEach(([path, data]) => {
        if (!path || path.endsWith("/") || path.startsWith("__MACOSX/")) {
          return;
        }
        const parts = path.split("/");
        const root = parts.length > 1 ? parts.shift() || "" : "";
        const relative = parts.join("/") || parts[0] || "";
        if (!relative) return;
        const encoding = isTextFile(relative) ? "utf-8" : "base64";
        const content = encoding === "utf-8" ? strFromU8(data) : toBase64(data);
        const entry = grouped.get(root) || {
          rootDir: root || undefined,
          files: [],
        };
        entry.files.push({ path: relative, content, encoding });
        grouped.set(root, entry);
      });
      await handleImportPayload(Array.from(grouped.values()));
    };

    onMounted(() => {
      if (folderInputRef.value) {
        folderInputRef.value.setAttribute("webkitdirectory", "true");
      }
      refreshSkills();
    });

    return () => (
      <div class="space-y-4">
        <div class="text-xs text-slate-500 dark:text-slate-400">
          Skills 通过 IndexedDB 存储；可用 @skill-name
          显式引用，或由选择器模型自动匹配。
          {isAuto.value
            ? "（自动模式：每次发送前会用选择器模型从已启用技能中挑选）"
            : null}
        </div>
        {missingAutoTarget.value && (
          <div class="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
            已开启“自动”，但尚未选择选择器模型：为安全起见，本次将不会自动启用技能。
          </div>
        )}

        <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
            checked={isAuto.value}
            onChange={(e) =>
              update({
                mode: (e.target as HTMLInputElement).checked
                  ? "auto"
                  : "manual",
              })
            }
          />
          <span class="font-medium">自动</span>
          <span class="text-xs text-slate-500 dark:text-slate-400">
            （用一个模型为每次输入选择需要启用的技能）
          </span>
        </label>

        {isAuto.value && (
          <label class="field">
            <span>选择器模型</span>
            <select
              value={currentKey.value}
              onChange={(e) => {
                const value = (e.target as HTMLSelectElement).value;
                const [providerId, modelId] = value.split(":");
                if (!providerId || !modelId) {
                  update({ autoSelectorTarget: null });
                  return;
                }
                update({ autoSelectorTarget: { providerId, modelId } });
              }}
            >
              <option value="">未选择</option>
              {options.value.map((opt) => (
                <option value={`${opt.providerId}:${opt.modelId}`}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
          <div class="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <span>已安装 Skills</span>
            <div class="flex items-center gap-2">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                class="hidden"
                onChange={(e) => {
                  const file =
                    (e.target as HTMLInputElement).files?.[0] || null;
                  void importZip(file);
                  (e.target as HTMLInputElement).value = "";
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                class="hidden"
                onChange={(e) => {
                  void importFolder((e.target as HTMLInputElement).files);
                  (e.target as HTMLInputElement).value = "";
                }}
              />
              <button
                type="button"
                class="btn btn-secondary text-xs"
                onClick={() => zipInputRef.value?.click()}
              >
                导入 Zip
              </button>
              <button
                type="button"
                class="btn btn-secondary text-xs"
                onClick={() => folderInputRef.value?.click()}
              >
                导入文件夹
              </button>
            </div>
          </div>

          {status.value && (
            <div class="mb-2 text-xs text-slate-500 dark:text-slate-400">
              {status.value}
            </div>
          )}

          {loading.value ? (
            <div class="text-xs text-slate-500">加载中...</div>
          ) : skills.value.length === 0 ? (
            <div class="text-xs text-slate-500">暂无 Skill</div>
          ) : (
            <div class="space-y-2">
              {skills.value.map((skill) => (
                <div class="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                    checked={skill.enabled}
                    onChange={(e) =>
                      toggleSkill(
                        skill.id,
                        (e.target as HTMLInputElement).checked,
                      )
                    }
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium">{skill.name}</span>
                      {skill.builtin ? (
                        <span class="rounded-full border border-indigo-200 px-2 py-0.5 text-[10px] text-indigo-600 dark:border-indigo-400/40 dark:text-indigo-200">
                          内置
                        </span>
                      ) : null}
                      <span class="text-xs text-slate-500 dark:text-slate-400">
                        {skill.description}
                      </span>
                    </div>
                    <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <button
                        type="button"
                        class="btn-link text-xs"
                        onClick={() => openEditor(skill.id)}
                      >
                        编辑
                      </button>
                      {!skill.builtin ? (
                        <button
                          type="button"
                          class="btn-link text-xs text-rose-500"
                          onClick={() => deleteSkill(skill.id)}
                        >
                          删除
                        </button>
                      ) : null}
                      <span>文件数: {skill.fileCount}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedSkillId.value && (
          <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
            <div class="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <span>编辑 Skill：{selectedSkillId.value}</span>
              <button
                type="button"
                class="btn btn-secondary text-xs"
                onClick={closeEditor}
              >
                关闭
              </button>
            </div>

            {editorStatus.value && (
              <div class="mb-2 text-xs text-slate-500 dark:text-slate-400">
                {editorStatus.value}
              </div>
            )}

            <div class="grid gap-3 md:grid-cols-[220px,1fr]">
              <div class="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {files.value.map((file) => (
                  <button
                    type="button"
                    class={`block w-full truncate rounded-lg px-2 py-1 text-left ${
                      activePath.value === file.path
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                    onClick={() => selectFile(file)}
                  >
                    {file.path}
                  </button>
                ))}
              </div>
              <div class="space-y-2">
                {activeEncoding.value !== "utf-8" ? (
                  <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    该文件为二进制内容，暂不支持编辑。
                  </div>
                ) : (
                  <>
                    <textarea
                      class="h-56 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      value={activeContent.value}
                      onInput={(e) => {
                        activeContent.value = (
                          e.target as HTMLTextAreaElement
                        ).value;
                        fileDirty.value = true;
                      }}
                    />
                    <button
                      type="button"
                      class="btn btn-primary text-xs"
                      disabled={!fileDirty.value}
                      onClick={saveFile}
                    >
                      保存文件
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
});
