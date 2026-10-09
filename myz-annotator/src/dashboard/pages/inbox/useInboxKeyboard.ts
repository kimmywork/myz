import type { InboxActions } from "./useInboxActions.js";
import type { InboxData } from "./useInboxData.js";

type FocusAction = "keep" | "archive" | "snooze" | "delete" | "mark";

const KEY_ACTIONS: Record<string, FocusAction> = {
  k: "keep",
  a: "archive",
  s: "snooze",
  d: "delete",
  m: "mark",
};

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/** Global focus-mode keyboard shortcuts. */
export function useInboxKeyboard(data: InboxData, actions: InboxActions) {
  function onKeydown(event: KeyboardEvent) {
    if (!data.focusMode.value) return;
    if (event.key === "Escape") {
      data.focusMode.value = false;
      return;
    }
    if (isTextEntry(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const item = data.focusItem.value;
    if (!item) return;
    const key = event.key.toLowerCase();
    if (key === " ") {
      event.preventDefault();
      actions.advance();
      return;
    }
    if (/^[1-9]$/.test(key)) {
      const tag = data.tagCounts.value[Number(key) - 1]?.tag;
      if (tag) {
        event.preventDefault();
        void actions.assignTagMany([item.targetId], tag);
      }
      return;
    }
    const action = KEY_ACTIONS[key];
    if (action) {
      event.preventDefault();
      void actions.runAction(item, action);
    }
  }

  return { onKeydown };
}

export type InboxKeyboard = ReturnType<typeof useInboxKeyboard>;
