import { computed, defineComponent, ref, watchEffect } from "vue"
import { desktopDashboardHost } from "../../../host/desktop"
import { useHighlightsStore } from "../../stores/highlights"
import { useSettingsStore } from "../../stores/settings"
import {
  parseMastodonProfileUrl,
  parseTwitterProfileUrl,
} from "../../utils/socialProfiles"

type StatusTone = "info" | "error" | "success"

export default defineComponent({
  name: "SocialImportSection",
  setup() {
    const settingsStore = useSettingsStore()
    const highlightsStore = useHighlightsStore()

    const twitterProfileUrl = ref("")
    const mastodonProfileUrl = ref("")
    const saving = ref(false)
    const status = ref("")
    const tone = ref<StatusTone>("info")

    watchEffect(() => {
      twitterProfileUrl.value = settingsStore.settings.socialImport.twitter.profileUrl
      mastodonProfileUrl.value = settingsStore.settings.socialImport.mastodon.profileUrl
    })

    const socialRecordIds = computed(() =>
      highlightsStore.rawRecords
        .filter((record) => {
          const kind = typeof record.kind === "string" ? record.kind : ""
          return kind.startsWith("tweet:") || kind.startsWith("toot:")
        })
        .map((record) => record.id)
        .filter(Boolean),
    )

    function setStatus(message: string, nextTone: StatusTone = "info") {
      status.value = message
      tone.value = nextTone
    }

    async function saveProfiles() {
      saving.value = true
      setStatus("保存中…")
      try {
        const nextTwitter = twitterProfileUrl.value.trim()
          ? parseTwitterProfileUrl(twitterProfileUrl.value).profileUrl
          : ""
        const nextMastodon = mastodonProfileUrl.value.trim()
          ? parseMastodonProfileUrl(mastodonProfileUrl.value).profileUrl
          : ""

        await settingsStore.saveSettings({
          socialImport: {
            twitter: { profileUrl: nextTwitter },
            mastodon: { profileUrl: nextMastodon },
          },
        })
        setStatus("导入偏好已保存", "success")
      } catch (error) {
        setStatus(`保存失败：${(error as Error).message}`, "error")
      } finally {
        saving.value = false
      }
    }

    async function clearImportedRecords() {
      if (!socialRecordIds.value.length) {
        setStatus("当前没有社区导入记录", "info")
        return
      }
      if (!window.confirm("将删除全部 tweet/toot 记录，确定继续吗？")) {
        return
      }
      saving.value = true
      setStatus("清理中…")
      try {
        const ids = [...socialRecordIds.value]
        await desktopDashboardHost.records.removeRecords(ids)
        await highlightsStore.refreshHighlights()
        setStatus(`已清理 ${ids.length} 条社区记录`, "success")
      } catch (error) {
        setStatus(`清理失败：${(error as Error).message}`, "error")
      } finally {
        saving.value = false
      }
    }

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>社区导入</h3>
        </div>
        <div class="settings__fields">
          <p class="settings__hint">
            桌面端已迁移社区导入偏好配置，浏览器抓取型导入流程仍待后续接入。
          </p>

          <div class="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/40">
            <h4 class="text-sm font-semibold text-slate-900 dark:text-white">
              Twitter / X
            </h4>
            <label class="field mt-3">
              <span>个人主页地址</span>
              <input
                type="url"
                placeholder="https://x.com/kenpusney"
                value={twitterProfileUrl.value}
                onInput={(event: InputEvent) => {
                  twitterProfileUrl.value = (event.target as HTMLInputElement).value
                }}
              />
            </label>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/40">
            <h4 class="text-sm font-semibold text-slate-900 dark:text-white">
              Mastodon
            </h4>
            <label class="field mt-3">
              <span>个人主页地址</span>
              <input
                type="url"
                placeholder="https://mastodon.social/@kenpusney"
                value={mastodonProfileUrl.value}
                onInput={(event: InputEvent) => {
                  mastodonProfileUrl.value = (event.target as HTMLInputElement).value
                }}
              />
            </label>
          </div>

          <div class="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
            当前桌面端仅保存社区导入配置，并支持清理已经同步到本地的 tweet/toot
            记录。网页抓取与自动导入能力尚未迁移。
          </div>

          <div class="settings__actions">
            <button
              class="btn btn-primary"
              type="button"
              disabled={saving.value}
              onClick={saveProfiles}
            >
              保存偏好
            </button>
            <button
              class="btn"
              type="button"
              disabled={saving.value}
              onClick={clearImportedRecords}
            >
              清理社区记录
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
