import { defineStore } from "pinia";
import { computed, reactive, ref, type Ref } from "vue";
import type { ImportStrategy } from "@myz/dashboard-core/host";
import { type MyZRecord, RECORD_KINDS, getRecordKind, isRecord } from "@myz/shared";
import { desktopDashboardHost } from "../../host/desktop";
import { downloadTextFile } from "../utils/download";
import {
  appendImportedTag,
  parseImportFile,
  type ImportSource,
} from "../utils/import";
import { normalizeMastodonStatusUrl, normalizeTweetUrl } from "../utils/social";
import { normalizeRecord, recordToMarkdown } from "../utils/records";

export const useHighlightsStore = defineStore("desktop-highlights", () => {
  const rawRecords: Ref<MyZRecord[]> = ref([]);
  const highlights: Ref<MyZRecord[]> = ref([]);
  const loadingHighlights = ref(true);
  const operationStatus = ref("");
  const importStatus = reactive<{
    message: string;
    tone: "info" | "error" | "success";
  }>({
    message: "",
    tone: "info",
  });
  const timers = new Map<object, number>();

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
      const normalized = kind.startsWith("tweet:")
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
            .map((record) => (typeof record?.kind === "string" ? record.kind : ""))
            .filter((kind) => kind.startsWith("tweet:") || kind.startsWith("toot:")),
        ),
      ) as RECORD_KINDS[];
      const isTweet = kinds.some((kind) => String(kind).startsWith("tweet:"));
      const priority = isTweet ? tweetPriority : tootPriority;
      kinds.sort((left, right) => priority.indexOf(left) - priority.indexOf(right));

      const base =
        bucket
          .slice()
          .sort(
            (left, right) =>
              priority.indexOf(left.kind as RECORD_KINDS) -
              priority.indexOf(right.kind as RECORD_KINDS),
          )[0] || bucket[0];

      const tags = Array.from(
        new Set(
          bucket
            .flatMap((record) => (Array.isArray(record.tags) ? record.tags : []))
            .filter(Boolean),
        ),
      );
      const note =
        base.note ||
        bucket.find((record) => typeof record.note === "string" && record.note.trim())
          ?.note ||
        "";
      const updatedAt = bucket
        .map((record) => Date.parse(record.updatedAt || record.createdAt || ""))
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => right - left)[0];

      const merged: MyZRecord = {
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
        note: note || undefined,
        updatedAt: Number.isFinite(updatedAt)
          ? new Date(updatedAt).toISOString()
          : base.updatedAt,
        socialKinds: kinds,
        socialRecordIds: bucket.map((record) => record.id).filter(Boolean),
        ...(isTweet
          ? {
              tweetKinds: kinds,
              tweetRecordIds: bucket.map((record) => record.id).filter(Boolean),
            }
          : {}),
      };
      mergedSocial.push(merged);
    });

    const merged = [...others, ...mergedSocial];
    merged.sort((left, right) => {
      const timeA = Date.parse(left.createdAt || left.updatedAt || "");
      const timeB = Date.parse(right.createdAt || right.updatedAt || "");
      return (
        (Number.isFinite(timeB) ? timeB : 0) -
        (Number.isFinite(timeA) ? timeA : 0)
      );
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

  function setTimedStatus(target: Ref<string>, message: string, duration = 3000) {
    target.value = message;
    if (timers.has(target)) {
      window.clearTimeout(timers.get(target));
    }
    if (duration > 0) {
      const id = window.setTimeout(() => {
        target.value = "";
        timers.delete(target);
      }, duration);
      timers.set(target, id);
    }
  }

  async function loadHighlights() {
    loadingHighlights.value = true;
    try {
      const result = await desktopDashboardHost.records.listRecords();
      const normalized = Array.isArray(result)
        ? (result
            .map((item) => normalizeRecord(item))
            .filter(Boolean) as MyZRecord[])
        : [];
      rawRecords.value = normalized;
      highlights.value = mergeSocialRecordsForDashboard(normalized);
    } catch (error) {
      console.error("Failed to load highlights", error);
      rawRecords.value = [];
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

  function findMergedRecord(id: string) {
    return highlights.value.find((item) => item.id === id) || null;
  }

  function findRawRecord(id: string) {
    return rawRecords.value.find((item) => item.id === id) || null;
  }

  async function copyHighlight(id: string) {
    const record = findMergedRecord(id);
    if (!record) {
      return;
    }
    try {
      await navigator.clipboard.writeText(recordToMarkdown(record));
      setTimedStatus(operationStatus, "已复制到剪贴板", 2000);
    } catch (error) {
      console.error("复制失败", error);
      setTimedStatus(operationStatus, "复制失败", 2000);
    }
  }

  async function deleteHighlight(id: string) {
    try {
      const record = findMergedRecord(id);
      const recordBag = isRecord(record) ? record : null;
      const legacyIds = Array.isArray(recordBag?.tweetRecordIds)
        ? recordBag.tweetRecordIds.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0,
          )
        : [];
      const ids = Array.isArray(record?.socialRecordIds)
        ? record.socialRecordIds
        : legacyIds.length
          ? legacyIds
          : [id];
      await desktopDashboardHost.records.removeRecords(ids);
      await refreshHighlights();
    } catch (error) {
      console.error("删除失败", error);
      setTimedStatus(operationStatus, `删除失败：${(error as Error).message}`);
    }
  }

  async function saveRecordPatch(id: string, patch: Partial<MyZRecord>) {
    const current = findRawRecord(id);
    if (!current) {
      throw new Error("记录不存在");
    }

    const candidate = normalizeRecord({
      ...current,
      ...patch,
      id: current.id,
      updatedAt: new Date().toISOString(),
      kind: getRecordKind({
        ...current,
        ...patch,
      }),
    });
    if (!candidate) {
      throw new Error("记录格式无效");
    }

    await desktopDashboardHost.records.saveRecord(candidate);
  }

  async function saveRecordsPatch(recordIds: string[], patch: Partial<MyZRecord>) {
    const nextRecords = recordIds
      .map((recordId) => {
        const current = findRawRecord(recordId);
        if (!current) {
          return null;
        }
        return normalizeRecord({
          ...current,
          ...patch,
          id: current.id,
          updatedAt: new Date().toISOString(),
          kind: getRecordKind({
            ...current,
            ...patch,
          }),
        });
      })
      .filter(Boolean) as MyZRecord[];

    if (!nextRecords.length) {
      throw new Error("记录不存在");
    }

    await desktopDashboardHost.records.saveRecords(nextRecords);
  }

  async function downgradeHighlight(id: string) {
    const record = findRawRecord(id);
    if (!record || record.kind === RECORD_KINDS.CLIP) {
      return;
    }

    try {
      await saveRecordPatch(id, {
        kind: RECORD_KINDS.CLIP,
        range: undefined,
        color: undefined,
      });
      await refreshHighlights();
    } catch (error) {
      console.error("降级失败", error);
      setTimedStatus(operationStatus, `降级失败：${(error as Error).message}`);
    }
  }

  async function handleExport(format: "markdown" | "json") {
    try {
      const result = await desktopDashboardHost.records.exportRecords();
      if (format === "markdown") {
        downloadTextFile(
          result.markdown,
          "text/markdown;charset=utf-8",
          `myz-export-${Date.now()}.md`,
        );
        return;
      }

      downloadTextFile(
        result.json,
        "application/json;charset=utf-8",
        `myz-export-${Date.now()}.json`,
      );
    } catch (error) {
      console.error("导出失败", error);
      setTimedStatus(operationStatus, `导出失败：${(error as Error).message}`);
    }
  }

  async function importRecords(input: {
    records: MyZRecord[];
    strategy: ImportStrategy;
  }) {
    return desktopDashboardHost.records.importRecords(input);
  }

  async function importHighlightsFromFile(
    file: File | undefined,
    strategy: ImportStrategy,
    source: ImportSource,
  ) {
    if (!file) {
      importStatus.message = "请选择要导入的文件"
      importStatus.tone = "error"
      return
    }

    importStatus.message = "读取文件中…"
    importStatus.tone = "info"

    try {
      const text = await file.text()
      const { records } = parseImportFile(file, text, source)
      if (!records.length) {
        importStatus.message = "未识别到可导入的标注"
        importStatus.tone = "error"
        return
      }

      const result = await importRecords({
        records: appendImportedTag(records),
        strategy,
      })
      await refreshHighlights()
      importStatus.message = `导入完成：新增 ${result.inserted} 条，覆盖 ${result.replaced} 条，跳过 ${result.skipped} 条`
      importStatus.tone = "success"
    } catch (error) {
      importStatus.message = `导入失败：${(error as Error).message}`
      importStatus.tone = "error"
    }
  }

  function cleanup() {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
  }

  return {
    rawRecords,
    highlights,
    loadingHighlights,
    operationStatus,
    importStatus,
    availableSites,
    availableTags,
    initialize,
    loadHighlights,
    refreshHighlights,
    findMergedRecord,
    copyHighlight,
    deleteHighlight,
    saveRecordPatch,
    saveRecordsPatch,
    downgradeHighlight,
    handleExport,
    importRecords,
    importHighlightsFromFile,
    cleanup,
  };
});
