import { defineStore } from "pinia";
import { computed, reactive, ref, Ref } from "vue";
import { IMPORT_MAX_BYTES } from "../constants.js";
import { ImportStrategy } from "@/background/import.js";
import { downloadFile } from "@/dashboard/utils/download.js";
import { normalizeImportedPayload } from "@/dashboard/utils/import.js";
import { normalizeRecord, recordToMarkdown } from "@/dashboard/utils/records.js";
import { sendMessage } from "@/shared/messaging.js";
import { MyZRecord, RECORD_KINDS } from "@/shared/types.js";
import { normalizeTweetUrl } from "@/shared/social/twitter";
import { normalizeMastodonStatusUrl } from "@/shared/social/mastodon";

export type MessageTone = "info" | "error" | "success";

export interface ImportStatus {
  message: string;
  tone?: MessageTone;
}

export const useHighlightsStore = defineStore("highlights", () => {
  const highlights: Ref<MyZRecord[]> = ref([]);
  const loadingHighlights = ref(true);
  const importStatus: ImportStatus = reactive({ message: "", tone: "info" });
  const operationStatus = ref("");
  const timers = new Map();

  /**
   * Dashboard requirement: if the same social URL is stored multiple times with different
   * kinds (e.g. tweet:retweet + tweet:favorite + tweet:bookmark), display only one entry and
   * expose all kinds for UI badges via `socialKinds`/`socialRecordIds`.
   */
  function mergeSocialRecordsForDashboard(records: MyZRecord[]): MyZRecord[] {
    const buckets = new Map<string, MyZRecord[]>();
    const others: MyZRecord[] = [];

    records.forEach((record) => {
      const kind = typeof record?.kind === "string" ? record.kind : "";
      const isSocial = kind.startsWith("tweet:") || kind.startsWith("toot:");
      if (!isSocial) {
        others.push(record);
        return;
      }
      const rawUrl = record.url || record.sourceUrl || "";
      const normalized =
        kind.startsWith("tweet:")
          ? normalizeTweetUrl(rawUrl)
          : normalizeMastodonStatusUrl(rawUrl);
      const key = normalized || rawUrl;
      if (!key) {
        others.push(record);
        return;
      }
      const bucket = buckets.get(key) || [];
      bucket.push(record);
      buckets.set(key, bucket);
    });

    const tweetPriority: RECORD_KINDS[] = [
      RECORD_KINDS.TWEET_RETWEET,
      RECORD_KINDS.TWEET_POST,
      RECORD_KINDS.TWEET_REPLY,
      RECORD_KINDS.TWEET_FAVORITE,
      RECORD_KINDS.TWEET_BOOKMARK,
    ];
    const tootPriority: RECORD_KINDS[] = [
      RECORD_KINDS.TOOT_BOOST,
      RECORD_KINDS.TOOT_POST,
      RECORD_KINDS.TOOT_REPLY,
      RECORD_KINDS.TOOT_FAVORITE,
      RECORD_KINDS.TOOT_BOOKMARK,
    ];

    const mergedSocial: MyZRecord[] = [];
    buckets.forEach((bucket, key) => {
      if (!bucket.length) {
        return;
      }
      const kinds = Array.from(
        new Set(
          bucket
            .map((r) => (typeof r?.kind === "string" ? r.kind : ""))
            .filter((k) => k.startsWith("tweet:") || k.startsWith("toot:")),
        ),
      ) as RECORD_KINDS[];
      const isTweet = kinds.some((k) => String(k).startsWith("tweet:"));
      const priority = isTweet ? tweetPriority : tootPriority;
      kinds.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));

      const base =
        bucket
          .slice()
          .sort(
            (a, b) =>
              priority.indexOf(a.kind as RECORD_KINDS) -
              priority.indexOf(b.kind as RECORD_KINDS),
          )[0] || bucket[0];

      const tags = Array.from(
        new Set(
          bucket
            .flatMap((r) => (Array.isArray(r.tags) ? r.tags : []))
            .filter(Boolean),
        ),
      );
      const note =
        base.note ||
        bucket.find((r) => typeof r.note === "string" && r.note.trim())?.note ||
        "";
      const updatedAt = bucket
        .map((r) => Date.parse(r.updatedAt || r.createdAt || ""))
        .filter((t) => Number.isFinite(t))
        .sort((a, b) => b - a)[0];

      const merged: any = {
        ...base,
        url: key,
        sourceUrl: key,
        hostname:
          base.hostname ||
          (() => {
            try {
              return new URL(key).hostname || "";
            } catch {
              return isTweet ? "x.com" : "";
            }
          })(),
        tags: tags.length ? tags : undefined,
        note: note ? note : undefined,
        updatedAt: Number.isFinite(updatedAt)
          ? new Date(updatedAt).toISOString()
          : base.updatedAt,
        socialKinds: kinds,
        socialRecordIds: bucket.map((r) => r.id).filter(Boolean),
        ...(isTweet
          ? {
              tweetKinds: kinds,
              tweetRecordIds: bucket.map((r) => r.id).filter(Boolean),
            }
          : {}),
      };
      mergedSocial.push(merged as MyZRecord);
    });

    const merged = [...others, ...mergedSocial];
    merged.sort((a, b) => {
      const timeA = Date.parse(a.createdAt || a.updatedAt || "");
      const timeB = Date.parse(b.createdAt || b.updatedAt || "");
      return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0);
    });
    return merged;
  }

  const availableSites = computed(() => {
    return [
      ...new Set(
        highlights.value
          .map((item) => item.hostname)
          .filter(Boolean) as string[],
      ),
    ].sort((a, b) => a.localeCompare(b));
  });

  const availableTags = computed(() => {
    const set = new Set<string>();
    highlights.value.forEach((item) => {
      (item.tags || []).forEach((tag) => set.add(tag));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  function setTimedStatus(
    target: Ref<string | null>,
    message: string,
    duration = 3000,
  ) {
    target.value = message;
    if (timers.has(target)) {
      clearTimeout(timers.get(target));
    }
    if (duration > 0) {
      const id = setTimeout(() => {
        target.value = "";
        timers.delete(target);
      }, duration);
      timers.set(target, id);
    }
  }

  function setTimedImportStatus(
    message: string,
    tone: MessageTone = "info",
    duration = 3000,
  ) {
    importStatus.message = message;
    importStatus.tone = tone;
    if (timers.has(importStatus)) {
      clearTimeout(timers.get(importStatus));
    }
    if (duration > 0) {
      const id = setTimeout(() => {
        importStatus.message = "";
        importStatus.tone = "info";
        timers.delete(importStatus);
      }, duration);
      timers.set(importStatus, id);
    }
  }

  async function loadHighlights() {
    loadingHighlights.value = true;
    try {
      const result = await sendMessage("myz:getAllHighlights");
      const normalized = Array.isArray(result)
        ? (result
            .map((item) => normalizeRecord(item))
            .filter(Boolean) as MyZRecord[])
        : [];
      highlights.value = mergeSocialRecordsForDashboard(normalized);
    } catch (error) {
      console.error("Failed to load highlights", error);
      highlights.value = [];
      throw error;
    } finally {
      loadingHighlights.value = false;
    }
  }

  async function refreshHighlights() {
    await loadHighlights();
  }

  async function initialize() {
    await loadHighlights();
  }

  async function copyHighlight(id: string) {
    const record = highlights.value.find((item) => item.id === id);
    if (!record) {
      return;
    }
    const markdown = recordToMarkdown(record);
    try {
      await navigator.clipboard.writeText(markdown);
      setTimedStatus(operationStatus, "已复制到剪贴板", 2000);
    } catch (error) {
      console.error("复制失败", error);
      setTimedStatus(operationStatus, "复制失败", 2000);
    }
  }

  async function deleteHighlight(id: string) {
    try {
      const record: any = highlights.value.find((item) => item.id === id);
      const ids = Array.isArray(record?.socialRecordIds)
        ? record.socialRecordIds
        : Array.isArray(record?.tweetRecordIds)
          ? record.tweetRecordIds
          : [];
      if (ids.length) {
        await sendMessage("myz:removeRecordsByIds", { ids });
      } else {
        await sendMessage("myz:removeHighlight", { id });
      }
      highlights.value = highlights.value.filter((item) => item.id !== id);
    } catch (error) {
      console.error("删除失败", error);
      setTimedStatus(operationStatus, `删除失败：${(error as Error).message}`);
    }
  }

  function applyUpdatedRecord(updated: MyZRecord) {
    const normalized = normalizeRecord(updated);
    if (!normalized) {
      return;
    }
    const index = highlights.value.findIndex(
      (item) => item.id === normalized.id,
    );
    if (index !== -1) {
      highlights.value.splice(index, 1, {
        ...highlights.value[index],
        ...normalized,
      });
    } else {
      highlights.value.unshift(normalized);
    }
  }

  async function downgradeHighlight(id: string) {
    const record = highlights.value.find((item) => item.id === id);
    if (!record || record.kind === RECORD_KINDS.CLIP) {
      return;
    }
    try {
      const updated = await sendMessage("myz:updateHighlight", {
        id,
        kind: RECORD_KINDS.CLIP,
        range: null,
        color: null,
      });
      applyUpdatedRecord(updated);
    } catch (error) {
      console.error("降级失败", error);
      setTimedStatus(operationStatus, `降级失败：${(error as Error).message}`);
    }
  }

  async function handleExport(format: "markdown" | "json") {
    try {
      const result = await sendMessage("myz:export");
      if (!result) {
        return;
      }
      if (format === "markdown") {
        downloadFile(
          result.markdown,
          "text/markdown",
          `myz-export-${Date.now()}.md`,
        );
      } else {
        downloadFile(
          result.json,
          "application/json",
          `myz-export-${Date.now()}.json`,
        );
      }
    } catch (error) {
      console.error("导出失败", error);
      setTimedStatus(operationStatus, `导出失败：${(error as Error).message}`);
    }
  }

  async function importHighlightsFromFile(
    file: File | undefined,
    strategy: ImportStrategy,
  ) {
    if (!file) {
      setTimedImportStatus("请先选择 JSON 文件", "error");
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setTimedImportStatus(
        `文件体积过大（>${Math.floor(IMPORT_MAX_BYTES / 1024 / 1024)}MB）`,
        "error",
      );
      return;
    }
    setTimedImportStatus("解析文件…", "info", 0);
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      setTimedImportStatus("JSON 格式无效", "error");
      throw error;
    }
    const records = normalizeImportedPayload(parsed);
    if (!records.length) {
      const message = "文件中未找到有效的标注数据";
      setTimedImportStatus(message, "error");
      throw new Error(message);
    }
    setTimedImportStatus("写入中…", "info", 0);
    const result = await sendMessage("myz:importHighlights", {
      records,
      strategy,
    });
    const inserted = typeof result?.inserted === "number" ? result.inserted : 0;
    const replaced = typeof result?.replaced === "number" ? result.replaced : 0;
    const skipped =
      typeof result?.skipped === "number"
        ? result.skipped
        : Math.max(records.length - inserted - replaced, 0);
    const parts = [];
    if (inserted) {
      parts.push(`新增 ${inserted}`);
    }
    if (replaced) {
      parts.push(`更新 ${replaced}`);
    }
    if (skipped) {
      parts.push(`跳过 ${skipped}`);
    }
    const summary = parts.length
      ? `（${parts.join(" · ")}）`
      : "无可导入的标注";
    setTimedImportStatus(
      `导入完成：${summary}`,
      inserted || replaced ? "success" : "info",
      4000,
    );
    await refreshHighlights();
  }

  function cleanup() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  }

  return {
    highlights,
    loadingHighlights,
    importStatus,
    operationStatus,
    availableSites,
    availableTags,
    initialize,
    loadHighlights,
    refreshHighlights,
    copyHighlight,
    deleteHighlight,
    downgradeHighlight,
    applyUpdatedRecord,
    handleExport,
    importHighlightsFromFile,
    cleanup,
  };
});
