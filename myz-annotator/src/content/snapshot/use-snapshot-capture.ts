/**
 * "Save the page" from a record (§I8 / §3.4, revised 2026-11-24), run in the
 * content script because only it has the live DOM.
 *
 * The snapshot is **page-bound** and is the page's **span around its
 * records**: everything from the first highlighted block to the last, plus a
 * little context (see `truncate.ts`). One rule for every page — article or
 * endless feed — because the span is bounded by the records themselves.
 *
 * Every outcome ends in a message the user can read — success or failed —
 * because the one thing this must never do is leave them believing a snapshot
 * exists when it does not.
 */
import { ref } from "vue";
import { useNotificationStore } from "../stores/notification-store.js";
import type { ExtractedSnapshot } from "./extract.js";
import { extractSnapshot } from "./extract.js";
import { invoke } from "@/messaging/invoke.js";

export function useSnapshotCapture() {
  const notify = useNotificationStore();
  const saving = ref(false);

  /**
   * Saves the page's snapshot.
   *
   * @param recordText The record the capture started from — one of the texts
   *   that define the span (redundant with the page's records, kept for
   *   clarity at the call site).
   */
  async function save(recordText?: string): Promise<boolean> {
    if (saving.value) return false;
    saving.value = true;
    try {
      const url = window.location.href;
      // 这页全部划线的文本：快照范围 = 包含它们的连续区域。
      const records = await invoke("myz:getHighlightsForUrl", {
        url,
      }).catch(() => []);
      const snapshot: ExtractedSnapshot = extractSnapshot(document, url, {
        anchorText: recordText,
        recordTexts: (records ?? []).map(
          (record: { text?: string }) => record.text,
        ),
      });
      if (!snapshot.html) {
        notify.notify({ message: "页面正文为空，无法保存快照" });
        return false;
      }

      const result = await invoke("myz:saveSnapshot", {
        url: snapshot.url,
        title: snapshot.title,
        html: snapshot.html,
        css: snapshot.css,
        bytes: snapshot.bytes,
      });

      if (!result?.ok) {
        // Never pretend: the quota failure is shown as a failure.
        notify.notify({ message: result?.error ?? "快照保存失败" });
        return false;
      }
      if (result.announceEviction) {
        notify.notify({ message: "已保存快照；空间不足，最旧的快照已被清理" });
      } else {
        notify.notify({ message: "已保存快照" });
      }
      return true;
    } catch (error) {
      notify.notify({ message: `快照保存失败：${(error as Error).message}` });
      return false;
    } finally {
      saving.value = false;
    }
  }

  return { saving, save };
}
