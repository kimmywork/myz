/**
 * "Save the whole page" from a record (§I8), run in the content script because
 * only it has the live DOM.
 *
 * The flow is: decide whether the page is eligible, extract the body, let the
 * background store it under quota. Every outcome ends in a message the user can
 * read — success, refused, or failed — because the one thing this must never do
 * is leave them believing a snapshot exists when it does not.
 */
import { ref } from "vue";
import { useNotificationStore } from "../stores/notification-store.js";
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

  async function save(recordId: string | undefined): Promise<boolean> {
    if (saving.value) return false;
    saving.value = true;
    try {
      const url = window.location.href;
      const eligibility = evaluatePage(url, {
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        visibleTextLength: visibleTextLength(),
      });
      if (!eligibility.capture) {
        notify.notify({ message: eligibility.reason ?? "这个页面不支持快照" });
        return false;
      }

      const snapshot = extractSnapshot(document, url);
      const result = await invoke("myz:saveSnapshot", {
        recordId,
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
        notify.notify({ message: "已保存整页快照" });
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
