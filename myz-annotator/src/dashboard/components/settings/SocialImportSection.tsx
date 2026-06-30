import { defineComponent, ref, watchEffect } from "vue";
import { useHighlightsStore } from "../../stores/highlights.js";
import { useSettingsStore } from "../../stores/settings.js";
import type {
  ClearTweetImportsMessageResult,
  ImportSocialRecordsMessageResult,
} from "@/background/messages/social-import";
import type { SocialImportRequest } from "@/background/social-import";
import { sendMessage } from "@/shared/messaging.js";
import { parseMastodonProfileUrl } from "@/shared/social/mastodon";
import { parseTwitterProfileUrl } from "@/shared/social/twitter";
import { RECORD_KINDS } from "@/shared/types";

type StatusTone = "info" | "error" | "success";

export default defineComponent({
  name: "SocialImportSection",

  setup() {
    const settingsStore = useSettingsStore();
    const highlightsStore = useHighlightsStore();

    const twitterProfileUrl = ref("");
    const mastodonProfileUrl = ref("");
    const limitPerKind = ref(60);
    const includeTweetPost = ref(true);
    const includeTweetReply = ref(true);
    const includeTweetFavorite = ref(true);
    const includeTweetBookmark = ref(true);

    const includeTootPost = ref(true);
    const includeTootReply = ref(true);
    const includeTootBoost = ref(true);
    const includeTootFavorite = ref(true);
    const includeTootBookmark = ref(true);

    const importing = ref(false);
    const status = ref("");
    const tone = ref<StatusTone>("info");

    watchEffect(() => {
      twitterProfileUrl.value =
        settingsStore.settings.socialImport.twitter.profileUrl;
      mastodonProfileUrl.value =
        settingsStore.settings.socialImport.mastodon.profileUrl;
    });

    function setStatus(message: string, nextTone: StatusTone = "info") {
      status.value = message;
      tone.value = nextTone;
    }

    function buildTwitterKinds() {
      const kinds: RECORD_KINDS[] = [];
      if (includeTweetPost.value) kinds.push(RECORD_KINDS.TWEET_POST);
      if (includeTweetReply.value) kinds.push(RECORD_KINDS.TWEET_REPLY);
      if (includeTweetFavorite.value) kinds.push(RECORD_KINDS.TWEET_FAVORITE);
      if (includeTweetBookmark.value) kinds.push(RECORD_KINDS.TWEET_BOOKMARK);
      return kinds;
    }

    function buildMastodonKinds() {
      const kinds: RECORD_KINDS[] = [];
      if (includeTootPost.value) kinds.push(RECORD_KINDS.TOOT_POST);
      if (includeTootReply.value) kinds.push(RECORD_KINDS.TOOT_REPLY);
      if (includeTootBoost.value) kinds.push(RECORD_KINDS.TOOT_BOOST);
      if (includeTootFavorite.value) kinds.push(RECORD_KINDS.TOOT_FAVORITE);
      if (includeTootBookmark.value) kinds.push(RECORD_KINDS.TOOT_BOOKMARK);
      return kinds;
    }

    async function handleImportTwitter() {
      if (importing.value) {
        return;
      }
      importing.value = true;
      setStatus("准备导入…", "info");

      try {
        const parsed = parseTwitterProfileUrl(twitterProfileUrl.value);
        const kinds = buildTwitterKinds();
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

        setStatus("抓取中…（将打开新窗口展示导入过程）", "info");
        const result = await sendMessage<
          SocialImportRequest,
          ImportSocialRecordsMessageResult
        >("myz:importSocialRecords", {
          provider: "twitter",
          profileUrl: parsed.profileUrl,
          kinds,
          limitPerKind: limitPerKind.value,
        });

        await highlightsStore.refreshHighlights();
        setStatus(
          `导入完成：新增 ${result.inserted} 条，跳过 ${result.skipped} 条`,
          "success",
        );
      } catch (error) {
        setStatus(`导入失败：${(error as Error).message}`, "error");
      } finally {
        importing.value = false;
      }
    }

    async function handleImportMastodon() {
      if (importing.value) {
        return;
      }
      importing.value = true;
      setStatus("准备导入…", "info");

      try {
        const parsed = parseMastodonProfileUrl(mastodonProfileUrl.value);
        const kinds = buildMastodonKinds();
        if (!kinds.length) {
          throw new Error("请至少选择一种导入类型");
        }

        await settingsStore.saveSettings({
          socialImport: {
            ...settingsStore.settings.socialImport,
            mastodon: {
              profileUrl: parsed.profileUrl,
            },
          },
        });

        setStatus("抓取中…（将打开新窗口展示导入过程）", "info");
        const result = await sendMessage<
          SocialImportRequest,
          ImportSocialRecordsMessageResult
        >("myz:importSocialRecords", {
          provider: "mastodon",
          profileUrl: parsed.profileUrl,
          kinds,
          limitPerKind: limitPerKind.value,
        });

        await highlightsStore.refreshHighlights();
        setStatus(
          `导入完成：新增 ${result.inserted} 条，跳过 ${result.skipped} 条`,
          "success",
        );
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
      const ok = window.confirm(
        "将删除所有 tweet:* 记录，且不可恢复。确定清理吗？",
      );
      if (!ok) {
        return;
      }
      importing.value = true;
      setStatus("清理中…", "info");
      try {
        const result = await sendMessage<
          undefined,
          ClearTweetImportsMessageResult
        >("myz:clearTweetImports");
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
            通过打开网页并抓取内容的方式导入（无需调用官方
            API）。书签页为私有内容， 需要在浏览器里已登录对应账号。
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
                  value={twitterProfileUrl.value}
                  onInput={(event: InputEvent) =>
                    (twitterProfileUrl.value = (
                      event.target as HTMLInputElement
                    ).value)
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
                    checked={includeTweetPost.value}
                    onChange={(event: Event) =>
                      (includeTweetPost.value = (
                        event.target as HTMLInputElement
                      ).checked)
                    }
                  />
                  <span>推文</span>
                </label>
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeTweetReply.value}
                    onChange={(event: Event) =>
                      (includeTweetReply.value = (
                        event.target as HTMLInputElement
                      ).checked)
                    }
                  />
                  <span>回复</span>
                </label>
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeTweetFavorite.value}
                    onChange={(event: Event) =>
                      (includeTweetFavorite.value = (
                        event.target as HTMLInputElement
                      ).checked)
                    }
                  />
                  <span>点赞</span>
                </label>
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeTweetBookmark.value}
                    onChange={(event: Event) =>
                      (includeTweetBookmark.value = (
                        event.target as HTMLInputElement
                      ).checked)
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
                  onClick={handleImportTwitter}
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
              </div>
            </div>
          </div>

          <div class="mt-4 rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/40">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-slate-900 dark:text-white">
                Mastodon
              </h4>
            </div>

            <div class="mt-3 grid gap-3">
              <label class="field">
                <span>个人主页地址</span>
                <input
                  type="url"
                  placeholder="https://mastodon.social/@kenpusney"
                  value={mastodonProfileUrl.value}
                  onInput={(event: InputEvent) =>
                    (mastodonProfileUrl.value = (
                      event.target as HTMLInputElement
                    ).value)
                  }
                />
              </label>

              <div class="grid gap-2 sm:grid-cols-2">
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeTootPost.value}
                    onChange={(event: Event) =>
                      (includeTootPost.value = (
                        event.target as HTMLInputElement
                      ).checked)
                    }
                  />
                  <span>嘟文</span>
                </label>
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeTootReply.value}
                    onChange={(event: Event) =>
                      (includeTootReply.value = (
                        event.target as HTMLInputElement
                      ).checked)
                    }
                  />
                  <span>回复</span>
                </label>
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeTootBoost.value}
                    onChange={(event: Event) =>
                      (includeTootBoost.value = (
                        event.target as HTMLInputElement
                      ).checked)
                    }
                  />
                  <span>转嘟</span>
                </label>
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeTootFavorite.value}
                    onChange={(event: Event) =>
                      (includeTootFavorite.value = (
                        event.target as HTMLInputElement
                      ).checked)
                    }
                  />
                  <span>点赞</span>
                </label>
                <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={includeTootBookmark.value}
                    onChange={(event: Event) =>
                      (includeTootBookmark.value = (
                        event.target as HTMLInputElement
                      ).checked)
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
                  onClick={handleImportMastodon}
                >
                  {importing.value ? "导入中…" : "开始导入"}
                </button>
              </div>
            </div>
          </div>

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
      </section>
    );
  },
});
