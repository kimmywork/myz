import { sendMessage } from "@myz/shared/messaging";
import { MyZRecord, RECORD_KINDS } from "@myz/shared/types";
import { defineStore } from "pinia";
import { computed, reactive, ref, Ref } from "vue";
import { IMPORT_MAX_BYTES } from "../constants.js";
import { ImportStrategy } from "@/background/import.js";
import { downloadFile } from "@/dashboard/utils/download.js";
import {
  appendImportedTag,
  parseImportFile,
  ImportSource,
} from "@/dashboard/utils/import.js";
import {
  normalizeRecord,
  recordToMarkdown,
} from "@/dashboard/utils/records.js";
import { setTimedStatus } from "@/dashboard/utils/setTimedStatus.js";

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
      highlights.value = normalized;
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
      await sendMessage("myz:removeHighlight", { id });
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
      const updated = await sendMessage<
        { id: string; kind: RECORD_KINDS; range: null; color: null },
        MyZRecord
      >("myz:updateHighlight", {
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
      const result = await sendMessage<
        undefined,
        { markdown?: string; json?: string } | null
      >("myz:export");
      if (!result) {
        return;
      }
      if (format === "markdown") {
        downloadFile(
          typeof result.markdown === "string" ? result.markdown : "",
          "text/markdown",
          `myz-export-${Date.now()}.md`,
        );
      } else {
        downloadFile(
          typeof result.json === "string" ? result.json : "",
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
    source: ImportSource = "auto",
  ) {
    if (!file) {
      setTimedImportStatus("请先选择导入文件", "error");
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
      ({ records: parsed } = parseImportFile(file, text, source));
    } catch (error) {
      setTimedImportStatus(
        (error as Error).message || "导入文件解析失败",
        "error",
      );
      throw error;
    }
    const records = appendImportedTag(parsed);
    if (!records.length) {
      const message = "文件中未找到有效的标注数据";
      setTimedImportStatus(message, "error");
      throw new Error(message);
    }
    setTimedImportStatus("写入中…", "info", 0);
    const result = await sendMessage<
      { records: MyZRecord[]; strategy: ImportStrategy },
      { inserted?: number; replaced?: number; skipped?: number }
    >("myz:importHighlights", {
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
