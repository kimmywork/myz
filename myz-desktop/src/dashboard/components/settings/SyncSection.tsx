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
    const syncSecret = ref("")
    const status = ref("")
    const tone = ref<StatusTone>("info")
    const isBusy = ref(false)
    const lastSyncAt = ref<string | null>(null)
    const pendingRecords = ref(0)
    const lastError = ref<string | null>(null)
    const syncState = ref("idle")
    const keyId = ref<string | null>(null)
    const keyUpdatedAt = ref<string | null>(null)
    const lastManifestVersion = ref(0)

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
        keyId.value = next.keyId || null
        keyUpdatedAt.value = next.keyUpdatedAt || null
        lastManifestVersion.value = next.lastManifestVersion || 0
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

    async function handleTestConnection() {
      if (
        isBusy.value ||
        !desktopDashboardHost.sync ||
        !desktopDashboardHost.sync.testConnection
      ) {
        return
      }
      isBusy.value = true
      setStatus("测试连接中…")
      try {
        const result = await desktopDashboardHost.sync.testConnection({
          enabled: enabled.value,
          s3: buildSyncPayload().s3,
        })
        setStatus(
          result.ok ? "连接成功" : result.message || "连接失败",
          result.ok ? "success" : "error",
        )
      } catch (error) {
        setStatus(`连接失败：${(error as Error).message}`, "error")
      } finally {
        isBusy.value = false
      }
    }

    async function handleSetSecret() {
      if (
        isBusy.value ||
        !desktopDashboardHost.sync ||
        !desktopDashboardHost.sync.setSecret
      ) {
        return
      }
      if (!syncSecret.value.trim()) {
        setStatus("请输入同步密钥", "error")
        return
      }
      isBusy.value = true
      setStatus("设置密钥中…")
      try {
        await desktopDashboardHost.sync.setSecret(syncSecret.value.trim())
        syncSecret.value = ""
        await refreshSyncStatus()
        setStatus("密钥已更新", "success")
      } catch (error) {
        setStatus(`设置密钥失败：${(error as Error).message}`, "error")
      } finally {
        isBusy.value = false
      }
    }

    async function handleClearSecret() {
      if (
        isBusy.value ||
        !desktopDashboardHost.sync ||
        !desktopDashboardHost.sync.clearSecret
      ) {
        return
      }
      isBusy.value = true
      setStatus("清除密钥中…")
      try {
        await desktopDashboardHost.sync.clearSecret()
        await refreshSyncStatus()
        setStatus("密钥已清除", "success")
      } catch (error) {
        setStatus(`清除密钥失败：${(error as Error).message}`, "error")
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
            使用与 annotator 相同的加密同步仓库。请先保存 S3 配置，再设置同步密钥。
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
            <div>当前 KeyId：{keyId.value || "未设置"}</div>
            <div>密钥更新时间：{keyUpdatedAt.value || "-"}</div>
            <div>Manifest 版本：{lastManifestVersion.value || 0}</div>
          </div>

          <div class="grid gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/40">
            <label class="field">
              <span>同步密钥</span>
              <input
                type="password"
                placeholder="仅保留在本地设备"
                value={syncSecret.value}
                onInput={(event: InputEvent) => {
                  syncSecret.value = (event.target as HTMLInputElement).value
                }}
              />
            </label>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200">
            当前桌面端会通过共享的 @myz/sync-core 读取远端 manifest / chunks，并把 highlights 与 conversations 拉取到本地。当前阶段仍以 pull-first 为主，不上传 desktop 本地新增记录。
          </div>

          <div class="settings__actions">
            <button
              class="btn"
              type="button"
              disabled={isBusy.value}
              onClick={handleSaveSettings}
            >
              保存设置
            </button>
            <button
              class="btn"
              type="button"
              disabled={isBusy.value}
              onClick={handleTestConnection}
            >
              测试连接
            </button>
            <button
              class="btn"
              type="button"
              disabled={isBusy.value}
              onClick={handleSetSecret}
            >
              设置密钥
            </button>
            <button
              class="btn"
              type="button"
              disabled={isBusy.value || !keyId.value}
              onClick={handleClearSecret}
            >
              清除密钥
            </button>
            <button
              class="btn btn-primary"
              type="button"
              disabled={isBusy.value || !enabled.value || !keyId.value}
              onClick={handleSyncNow}
            >
              立即同步
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
