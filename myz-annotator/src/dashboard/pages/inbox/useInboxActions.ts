import type { InboxStatus } from "@myz/shared/inbox";
import type { UndoState } from "./inbox-types.js";
import { snoozeTarget } from "./inbox-utils.js";
import type { InboxData } from "./useInboxData.js";
import type { InboxQueueItem } from "@/background/messages/inbox";
import { invoke } from "@/messaging/invoke";

type FocusAction = "keep" | "archive" | "snooze" | "delete" | "mark";

/** Mutations, drag/drop, undo, batch and focus-mode actions. */
export function useInboxActions(data: InboxData) {
  let undoTimer: ReturnType<typeof setTimeout> | null = null;
  let dragTargetIds: string[] = [];
  let dragTagName: string | null = null;

  function clearUndo() {
    if (undoTimer) {
      clearTimeout(undoTimer);
      undoTimer = null;
    }
    data.undo.value = null;
  }

  function scheduleUndo(state: UndoState) {
    clearUndo();
    data.undo.value = state;
    undoTimer = setTimeout(() => {
      data.undo.value = null;
      undoTimer = null;
    }, 5000);
  }

  async function revertUndo() {
    const state = data.undo.value;
    if (!state) return;
    clearUndo();
    await invoke("myz:inboxSetStatus", {
      targetId: state.targetId,
      status: state.prevStatus,
      snoozedUntil: state.prevSnoozedUntil,
    });
    await invoke("myz:inboxSetMark", {
      targetId: state.targetId,
      marked: state.wasMarked,
    });
    await data.load();
  }

  async function applyStatus(
    item: InboxQueueItem,
    next: InboxStatus,
    options: { snoozedUntil?: string; label: string; undoable?: boolean },
  ) {
    await invoke("myz:inboxSetStatus", {
      targetId: item.targetId,
      status: next,
      snoozedUntil: options.snoozedUntil,
    });
    if (options.undoable !== false) {
      scheduleUndo({
        targetId: item.targetId,
        prevStatus: item.status,
        prevSnoozedUntil: item.state?.snoozedUntil,
        wasMarked: item.marked,
        label: options.label,
      });
    }
    await data.load();
    data.status.value = options.label;
  }

  const keep = (item: InboxQueueItem) =>
    applyStatus(item, "kept", { label: "已保留" });
  const archive = (item: InboxQueueItem) =>
    applyStatus(item, "archived", { label: "已归档" });
  const snooze = (item: InboxQueueItem) =>
    applyStatus(item, "snoozed", {
      snoozedUntil: snoozeTarget("tomorrow"),
      label: "已稍后处理",
    });

  async function snoozeBucket(
    item: InboxQueueItem,
    bucket: "evening" | "tomorrow" | "week",
  ) {
    await applyStatus(item, "snoozed", {
      snoozedUntil: snoozeTarget(bucket),
      label: "已稍后处理",
    });
  }

  async function toggleMark(item: InboxQueueItem) {
    await invoke("myz:inboxSetMark", {
      targetId: item.targetId,
      marked: !item.marked,
    });
    await data.load();
  }

  async function remove(item: InboxQueueItem) {
    if (!window.confirm("删除后不可撤销，确定删除？")) return;
    await invoke("myz:removeHighlight", { id: item.record.id });
    clearUndo();
    await data.load();
    data.status.value = "已删除";
  }

  async function assignTagMany(targetIds: string[], tag: string) {
    let applied = 0;
    for (const targetId of targetIds) {
      const item = data.workingSet.value.find(
        (entry) => entry.targetId === targetId,
      );
      if (!item) continue;
      const current = item.record.tags || [];
      if (current.includes(tag)) continue;
      await invoke("myz:updateHighlight", {
        id: item.record.id,
        tags: [...current, tag],
      });
      applied += 1;
    }
    await data.load();
    data.status.value = applied
      ? `已为 ${applied} 条加上标签「${tag}」`
      : `已存在标签「${tag}」`;
  }

  async function commitTagDraft(item: InboxQueueItem) {
    const tag = data.tagDraft.value.trim();
    data.taggingId.value = null;
    data.tagDraft.value = "";
    if (tag) await assignTagMany([item.targetId], tag);
  }

  async function removeTag(item: InboxQueueItem, tag: string) {
    const next = (item.record.tags || []).filter((entry) => entry !== tag);
    await invoke("myz:updateHighlight", {
      id: item.record.id,
      tags: next,
    });
    await data.load();
    data.status.value = `已移除标签「${tag}」`;
  }

  function startRecordDrag(item: InboxQueueItem, event: DragEvent) {
    dragTagName = null;
    dragTargetIds =
      data.selected.value.size > 0 && data.selected.value.has(item.targetId)
        ? Array.from(data.selected.value)
        : [item.targetId];
    event.dataTransfer?.setData("text/plain", dragTargetIds.join(","));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
  }

  function startTagDrag(tag: string, event: DragEvent) {
    dragTagName = tag;
    dragTargetIds = [];
    event.dataTransfer?.setData("text/plain", `tag:${tag}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
  }

  function endDrag() {
    dragTargetIds = [];
    dragTagName = null;
  }

  function onDropOnTag(event: DragEvent, tag: string) {
    event.preventDefault();
    if (dragTagName) return;
    void assignTagMany(dragTargetIds, tag);
    endDrag();
  }

  function onDropOnRecord(event: DragEvent, item: InboxQueueItem) {
    event.preventDefault();
    if (dragTagName) {
      void assignTagMany([item.targetId], dragTagName);
    }
    endDrag();
  }

  function advance() {
    if (data.focusIndex.value < data.tabItems.value.length) {
      data.focusIndex.value = Math.min(
        data.focusIndex.value + 1,
        Math.max(data.tabItems.value.length - 1, 0),
      );
    }
  }

  async function runAction(item: InboxQueueItem, action: FocusAction) {
    if (action === "keep") await keep(item);
    else if (action === "archive") await archive(item);
    else if (action === "snooze") await snooze(item);
    else if (action === "delete") await remove(item);
    else await toggleMark(item);
    if (action !== "mark" && data.focusMode.value) advance();
  }

  function toggleSelect(targetId: string) {
    const next = new Set(data.selected.value);
    if (next.has(targetId)) next.delete(targetId);
    else next.add(targetId);
    data.selected.value = next;
  }

  async function batchStatus(next: InboxStatus, label: string) {
    const chosen = data.tabItems.value.filter((item) =>
      data.selected.value.has(item.targetId),
    );
    for (const item of chosen) {
      await invoke("myz:inboxSetStatus", {
        targetId: item.targetId,
        status: next,
      });
    }
    data.selected.value = new Set();
    await data.load();
    data.status.value = `${label}（${chosen.length}）`;
  }

  async function batchDelete() {
    const chosen = data.tabItems.value.filter((item) =>
      data.selected.value.has(item.targetId),
    );
    if (!chosen.length) return;
    if (!window.confirm(`删除 ${chosen.length} 条记录？删除不可撤销。`)) return;
    await invoke("myz:removeRecordsByIds", {
      ids: chosen.map((item) => item.record.id),
    });
    data.selected.value = new Set();
    await data.load();
    data.status.value = `已删除（${chosen.length}）`;
  }

  return {
    clearUndo,
    revertUndo,
    keep,
    archive,
    snooze,
    snoozeBucket,
    toggleMark,
    remove,
    assignTagMany,
    commitTagDraft,
    removeTag,
    startRecordDrag,
    startTagDrag,
    endDrag,
    onDropOnTag,
    onDropOnRecord,
    advance,
    runAction,
    toggleSelect,
    batchStatus,
    batchDelete,
  };
}

export type InboxActions = ReturnType<typeof useInboxActions>;
