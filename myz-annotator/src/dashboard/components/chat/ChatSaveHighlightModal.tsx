import { ChatSaveHighlightModal as SharedChatSaveHighlightModal } from "@myz/dashboard-chat-ui";
import { TagInput } from "@myz/dashboard-ui";
import { storeToRefs } from "pinia";
import { defineComponent, ref } from "vue";
import { useChatUIStore } from "@/dashboard/stores/chatUi.js";

export default defineComponent({
  name: "DashboardSaveHighlightModal",
  setup() {
    const uiStore = useChatUIStore();
    const { saveModal } = storeToRefs(uiStore);

    const note = ref("");
    const tags = ref(["ai-generated"]);
    const saving = ref(false);
    const tagInputRef = ref(null);

    function handleSave() {
      saving.value = true;
      uiStore
        .saveHighlight({
          note: note.value,
          tags: [...tags.value],
        })
        .finally(() => {
          saving.value = false;
          handleClose();
        });
    }

    function handleClose() {
      note.value = "";
      tags.value = ["ai-generated"];
      uiStore.closeSaveModal();
    }

    return () => (
      <SharedChatSaveHighlightModal
        state={saveModal.value}
        note={note.value}
        tags={tags.value}
        saving={saving.value}
        onClose={handleClose}
        onSave={handleSave}
        onNoteChange={(value) => {
          note.value = value;
        }}
        renderTagsInput={() => (
          <TagInput
            ref={tagInputRef}
            modelValue={tags.value}
            onUpdate:modelValue={(val: string[]) => (tags.value = val)}
            placeholder="添加标签，按回车确认"
          />
        )}
      />
    );
  },
});
