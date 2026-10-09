import { onBeforeUnmount, onMounted } from "vue";
import { useInboxActions } from "./useInboxActions.js";
import { useInboxData } from "./useInboxData.js";
import { useInboxKeyboard } from "./useInboxKeyboard.js";

/**
 * Composition root for the Inbox page: data, actions, keyboard shortcuts and
 * lifecycle. Components consume the returned API object.
 */
export function useInboxQueue() {
  const data = useInboxData();
  const actions = useInboxActions(data);
  const keyboard = useInboxKeyboard(data, actions);

  onMounted(() => {
    void data.load();
    window.addEventListener("keydown", keyboard.onKeydown);
    data.observeSentinel();
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", keyboard.onKeydown);
    data.disposeSentinel();
    actions.clearUndo();
  });

  return { ...data, ...actions, ...keyboard };
}

export type InboxApi = ReturnType<typeof useInboxQueue>;
