/**
 * "Save the page" from a record (§I8 / §3.4, revised 2026-11-23), run in the
 * content script because only it has the live DOM.
 *
 * The snapshot is **page-bound**: this saves the current page's copy, and every
 * record of the page anchors onto it. The record the capture started from only
 * anchors the window on endless surfaces (there is no whole page there).
 *
 * Every outcome ends in a message the user can read — success or failed —
 * because the one thing this must never do is leave them believing a snapshot
 * exists when it does not.
 */
import { ref } from "vue";
import { useNotificationStore } from "../stores/notification-store.js";
import type { ExtractedSnapshot } from "./extract.js";
import { extractSnapshot } from "./extract.js";
import { evaluatePage } from "./page-eligibility.js";
import { invoke } from "@/messaging/invoke.js";

/** Viewport text, used by the endless-scroll fallback. */
function visibleTextLength(): number {
  const height = window.innerHeight || 0;
  let total = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode() && total < 2000) {
    const node = walker.currentNode;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.top < height && rect.bottom > 0) {
      total += (node.textContent || "").trim().length;
    }
  }
  return total;
}

export function useSnapshotCapture() {
  const notify = useNotificationStore();
  const saving = ref(false);

  /**
   * Saves the page's snapshot.
   *
   * @param recordText The record the capture started from. Required to window
   *   an endless surface; ignored for the full capture.
   */
  async function save(recordText?: string): Promise<boolean> {
    if (saving.value) return false;
    saving.value = true;
    try {
      const url = window.location.href;
      const eligibility = evaluatePage(url, {
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        visibleTextLength: visibleTextLength(),
      });

      let snapshot: ExtractedSnapshot | null;
      if (eligibility.mode === "full") {
        snapshot = extractSnapshot(document, url, { mode: "full" });
      } else {
        // Endless surface: keep the cluster of this page's records instead of
        // a headless fragment (§3.4 stop rule: N elements with no neighbouring
        // record end the window).
        const records = await invoke("myz:getHighlightsForUrl", {
          url,
        }).catch(() => []);
        snapshot = extractSnapshot(document, url, {
          mode: "windowed",
          anchorText: recordText,
          recordTexts: (records ?? []).map((record) => record.text),
        });
        if (!snapshot) {
          notify.notify({
            message: "找不到这条划线在这一页上的位置，无法截取片段",
          });
          return false;
        }
      }
      if (!snapshot) {
        notify.notify({ message: "页面正文为空，无法保存快照" });
        return false;
      }
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
