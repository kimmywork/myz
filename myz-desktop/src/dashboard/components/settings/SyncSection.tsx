import { ToggleSwitch } from "@myz/dashboard-ai-settings"
import { defineComponent, onMounted, ref, watchEffect } from "vue"
import { desktopDashboardHost } from "../../../host/desktop"
import { useSettingsStore } from "../../stores/settings"

type StatusTone = "info" | "error" | "success"

export default defineComponent({
  name: "SyncSection",
  setup() {
    const settingsStore = useSettingsStore()
    const enabled = ref(false)
    const endpoint = ref("")
    const region = ref("")
    const bucket = ref("")
    const accessKeyId = ref("")
    const secretAccessKey = ref("")
    const sessionToken = ref("")
    const prefix = ref("")
    const status = ref("")
    const tone = ref<StatusTone>("info")
    const isBusy = ref(false)
    const lastSyncAt = ref<string | null>(null)
    const pendingRecords = ref(0)
    const lastError = ref<string | null>(null)
    const syncState = ref("idle")

    watchEffect(() => {
      const sync = settingsStore.settings.sync
      enabled.value = Boolean(sync.enabled)
      endpoint.value = sync.s3.endpoint || ""
      region.value = sync.s3.region || ""
      bucket.value = sync.s3.bucket || ""
      accessKeyId.value = sync.s3.accessKeyId || ""
      secretAccessKey.value = sync.s3.secretAccessKey || ""
      sessionToken.value = sync.s3.sessionToken || ""
      prefix.value = sync.s3.prefix || ""
    })

    function setStatus(message: string, nextTone: StatusTone = "info") {
      status.value = message
      tone.value = nextTone
    }

    function buildSyncPayload() {
      return {
        enabled: enabled.value,
        s3: {
          endpoint: endpoint.value.trim(),
          region: region.value.trim(),
          bucket: bucket.value.trim(),
          accessKeyId: accessKeyId.value.trim(),
          secretAccessKey: secretAccessKey.value.trim(),
          sessionToken: sessionToken.value.trim(),
          prefix: prefix.value.trim(),
        },
      }
    }

    async function refreshSyncStatus() {
      if (!desktopDashboardHost.sync) {
        return
      }
      try {
        const next = await desktopDashboardHost.sync.getStatus()
        lastSyncAt.value = next.lastSyncAt || null
        pendingRecords.value = next.pendingRecords || 0
        lastError.value = next.lastError || null
        syncState.value = next.state
      } catch (error) {
        setStatus(`读取同步状态失败：${(error as Error).message}`, "error")
      }
    }

    async function handleSaveSettings() {
      if (isBusy.value) {
        return
      }
      isBusy.value = true
      setStatus("保存中…")
      try {
        await settingsStore.saveSettings({
          sync: buildSyncPayload(),
        })
        await refreshSyncStatus()
        setStatus("同步配置已保存", "success")
      } catch (error) {
        setStatus(`保存失败：${(error as Error).message}`, "error")
      } finally {
        isBusy.value = false
      }
    }

    async function handleSyncNow() {
      if (isBusy.value || !desktopDashboardHost.sync) {
        return
      }
      isBusy.value = true
      setStatus("同步中…")
      try {
        const result = await desktopDashboardHost.sync.runSync("manual")
        setStatus(
          result.ok
            ? result.message || "同步完成"
            : result.message || "同步失败",
          result.ok ? "success" : "error",
        )
        await refreshSyncStatus()
      } catch (error) {
        setStatus(`同步失败：${(error as Error).message}`, "error")
      } finally {
        isBusy.value = false
      }
    }

    onMounted(() => {
      void refreshSyncStatus()
    })

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>桌面同步</h3>
        </div>
        <div class="settings__fields">
          <p class="settings__hint">
            通过桌面 host 保存同步配置，并执行一次真实的 S3 读写连通性校验。
          </p>

          <div class="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/90 p-3 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
            <span>启用同步</span>
            <ToggleSwitch
              checked={enabled.value}
              ariaLabel="启用同步"
              onChange={(event: Event) => {
                enabled.value = (event.target as HTMLInputElement).checked
              }}
            />
          </div>

          <div class="grid gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/40">
            <label class="field">
              <span>S3 Endpoint</span>
              <input
                type="url"
                placeholder="https://s3.example.com"
                value={endpoint.value}
                onInput={(event: InputEvent) => {
                  endpoint.value = (event.target as HTMLInputElement).value
                }}
              />
            </label>
            <label class="field">
              <span>Region</span>
              <input
                type="text"
                placeholder="us-east-1"
                value={region.value}
                onInput={(event: InputEvent) => {
                  region.value = (event.target as HTMLInputElement).value
                }}
              />
            </label>
            <label class="field">
              <span>Bucket</span>
              <input
                type="text"
                placeholder="myz-sync"
                value={bucket.value}
                onInput={(event: InputEvent) => {
                  bucket.value = (event.target as HTMLInputElement).value
                }}
              />
            </label>
            <label class="field">
              <span>Access Key ID</span>
              <input
                type="text"
                value={accessKeyId.value}
                onInput={(event: InputEvent) => {
                  accessKeyId.value = (event.target as HTMLInputElement).value
                }}
              />
            </label>
            <label class="field">
              <span>Secret Access Key</span>
              <input
                type="password"
                value={secretAccessKey.value}
                onInput={(event: InputEvent) => {
                  secretAccessKey.value = (event.target as HTMLInputElement).value
                }}
              />
            </label>
            <label class="field">
              <span>Session Token（可选）</span>
              <input
                type="text"
                value={sessionToken.value}
                onInput={(event: InputEvent) => {
                  sessionToken.value = (event.target as HTMLInputElement).value
                }}
              />
            </label>
            <label class="field">
              <span>Prefix（可选）</span>
              <input
                type="text"
                value={prefix.value}
                onInput={(event: InputEvent) => {
                  prefix.value = (event.target as HTMLInputElement).value
                }}
              />
            </label>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white/90 p-4 text-xs text-slate-500 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
            <div>状态：{syncState.value}</div>
            <div>最近执行：{lastSyncAt.value || "未执行"}</div>
            <div>待同步记录：{pendingRecords.value}</div>
            <div>最近错误：{lastError.value || "无"}</div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200">
            当前桌面端会校验配置是否完整，并对目标 S3 执行真实的 list / put / delete 探测。若校验成功，状态会如实保留为“可连接”，但桌面端暂未执行双向记录传输。
          </div>

          <div class="settings__actions">
            <button
              class="btn btn-primary"
              type="button"
              disabled={isBusy.value}
              onClick={handleSaveSettings}
            >
              保存设置
            </button>
            <button
              class="btn"
              type="button"
              disabled={isBusy.value || !enabled.value}
              onClick={handleSyncNow}
            >
              验证连接
            </button>
            <p
              class={[
                "status-line",
                tone.value === "error"
                  ? " status-line--error"
                  : tone.value === "success"
                    ? " status-line--success"
                    : "",
              ].join(" ")}
            >
              {status.value}
            </p>
          </div>
        </div>
      </section>
    )
  },
})
