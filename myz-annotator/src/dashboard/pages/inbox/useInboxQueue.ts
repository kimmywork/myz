import { onBeforeUnmount, onMounted } from "vue";
import { useInboxActions } from "./useInboxActions.js";
import { useInboxData } from "./useInboxData.js";
import { useInboxKeyboard } from "./useInboxKeyboard.js";
import { subscribeRefresh } from "@/messaging/changeRefresh";

/**
 * Composition root for the Inbox page: data, actions, keyboard shortcuts and
 * lifecycle. Components consume the returned API object.
 */
export function useInboxQueue() {
  const data = useInboxData();
  const actions = useInboxActions(data);
  const keyboard = useInboxKeyboard(data, actions);
  let unsubscribe: (() => void) | null = null;

  onMounted(() => {
    void data.load();
    window.addEventListener("keydown", keyboard.onKeydown);
    data.observeSentinel();
    // Refresh when another tab, reader, or a background sync changes records.
    unsubscribe = subscribeRefresh(["inbox", "records", "sync"], () => {
      void data.load();
    });
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", keyboard.onKeydown);
    data.disposeSentinel();
    actions.clearUndo();
    unsubscribe?.();
  });

  return { ...data, ...actions, ...keyboard };
}

export type InboxApi = ReturnType<typeof useInboxQueue>;
