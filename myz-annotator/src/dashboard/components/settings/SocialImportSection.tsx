import { defineComponent, ref, watchEffect } from "vue";
import { useHighlightsStore } from "../../stores/highlights.js";
import { useSettingsStore } from "../../stores/settings.js";
import { sendMessage } from "@/shared/messaging.js";
import { RECORD_KINDS } from "@/shared/types";
import { parseTwitterProfileUrl } from "@/shared/social/twitter";

type StatusTone = "info" | "error" | "success";

export default defineComponent({
  name: "SocialImportSection",

  setup() {
    const settingsStore = useSettingsStore();
    const highlightsStore = useHighlightsStore();

    const profileUrl = ref("");
    const limitPerKind = ref(60);
    const includePost = ref(true);
    const includeReply = ref(true);
    const includeFavorite = ref(true);
    const includeBookmark = ref(true);

    const importing = ref(false);
    const status = ref("");
    const tone = ref<StatusTone>("info");

    watchEffect(() => {
      profileUrl.value = settingsStore.settings.socialImport.twitter.profileUrl;
    });

    function setStatus(message: string, nextTone: StatusTone = "info") {
      status.value = message;
      tone.value = nextTone;
    }

    function buildKinds() {
      const kinds: RECORD_KINDS[] = [];
      if (includePost.value) kinds.push(RECORD_KINDS.TWEET_POST);
      if (includeReply.value) kinds.push(RECORD_KINDS.TWEET_REPLY);
      if (includeFavorite.value) kinds.push(RECORD_KINDS.TWEET_FAVORITE);
      if (includeBookmark.value) kinds.push(RECORD_KINDS.TWEET_BOOKMARK);
      return kinds;
    }

    async function handleImport() {
      if (importing.value) {
        return;
      }
      importing.value = true;
      setStatus("准备导入…", "info");

      try {
        const parsed = parseTwitterProfileUrl(profileUrl.value);
        const kinds = buildKinds();
        if (!kinds.length) {
          throw new Error("请至少选择一种导入类型");
        }

        await settingsStore.saveSettings({
          socialImport: {
            ...settingsStore.settings.socialImport,
            twitter: {
              profileUrl: parsed.profileUrl,
            },
          },
        });

        setStatus("抓取中…（将会在后台打开 x.com 页面）", "info");
        const result = await sendMessage("myz:importSocialRecords", {
          provider: "twitter",
          profileUrl: parsed.profileUrl,
          kinds,
          limitPerKind: limitPerKind.value,
        });

        await highlightsStore.refreshHighlights();
        setStatus(`导入完成：新增 ${result.inserted} 条，跳过 ${result.skipped} 条`, "success");
      } catch (error) {
        setStatus(`导入失败：${(error as Error).message}`, "error");
      } finally {
        importing.value = false;
      }
    }

    async function handleClearTweets() {
      if (importing.value) {
        return;
      }
      const ok = window.confirm("将删除所有 tweet:* 记录，且不可恢复。确定清理吗？");
      if (!ok) {
        return;
      }
      importing.value = true;
      setStatus("清理中…", "info");
      try {
        const result = await sendMessage("myz:clearTweetImports");
        await highlightsStore.refreshHighlights();
        setStatus(`清理完成：删除 ${result.removed} 条`, "success");
      } catch (error) {
        setStatus(`清理失败：${(error as Error).message}`, "error");
      } finally {
        importing.value = false;
      }
    }

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>社区导入</h3>
        </div>
        <div class="settings__fields">
          <p class="settings__hint">
            通过打开网页并抓取内容的方式导入（无需调用官方 API）。书签页为私有内容，
            需要在浏览器里已登录对应账号。
          </p>

          <div class="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/40">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900 dark:text-white">
                Twitter / X
              </h4>
            </div>

            <div class="mt-3 grid gap-3">
              <label class="field">
                <span>个人主页地址</span>
                <input
                  type="url"
                  placeholder="https://x.com/kenpusney"
                  value={profileUrl.value}
                  onInput={(event: InputEvent) =>
                    (profileUrl.value = (event.target as HTMLInputElement).value)
                  }
                />
              </label>

              <label class="field">
                <span>每类最多导入</span>
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={limitPerKind.value}
                  onInput={(event: InputEvent) =>
                    (limitPerKind.value = Math.max(
                      1,
                      Number((event.target as HTMLInputElement).value || 60),
                    ))
                  }
                />
              </label>

              <div class="grid gap-2 sm:grid-cols-2">
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includePost.value}
                    onChange={(event: Event) =>
                      (includePost.value = (event.target as HTMLInputElement).checked)
                    }
                  />
                  <span>推文</span>
                </label>
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeReply.value}
                    onChange={(event: Event) =>
                      (includeReply.value = (event.target as HTMLInputElement).checked)
                    }
                  />
                  <span>回复</span>
                </label>
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeFavorite.value}
                    onChange={(event: Event) =>
                      (includeFavorite.value = (event.target as HTMLInputElement).checked)
                    }
                  />
                  <span>点赞</span>
                </label>
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeBookmark.value}
                    onChange={(event: Event) =>
                      (includeBookmark.value = (event.target as HTMLInputElement).checked)
                    }
                  />
                  <span>书签</span>
                </label>
              </div>

              <div class="settings__actions">
                <button
                  class="btn"
                  type="button"
                  disabled={importing.value}
                  onClick={handleImport}
                >
                  {importing.value ? "导入中…" : "开始导入"}
                </button>
                <button
                  class="btn"
                  type="button"
                  disabled={importing.value}
                  onClick={handleClearTweets}
                >
                  清理导入
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
          </div>
        </div>
      </section>
    );
  },
});
