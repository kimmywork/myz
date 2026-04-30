import { ChatImagePreviewModal as SharedChatImagePreviewModal } from "@myz/dashboard-chat-ui";
import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import { useUIStore } from "../stores/ui.js";

export default defineComponent({
  name: "ImagePreviewModal",
  setup() {
    const uiStore = useUIStore();
    const { imagePreview } = storeToRefs(uiStore);

    return () => (
      <SharedChatImagePreviewModal
        state={imagePreview.value}
        onClose={() => uiStore.closeImagePreview()}
      />
    );
  },
});
