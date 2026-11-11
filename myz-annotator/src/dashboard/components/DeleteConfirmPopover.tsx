import ConfirmPopover from "@myz/shared/components/ConfirmPopover";
import { defineComponent } from "vue";
import { useDeleteStore } from "../stores/delete.js";

/** Annotated-record guard (§4.30): confirmation replaces undo. */
export default defineComponent({
  name: "DeleteConfirmPopover",
  setup() {
    const deleteStore = useDeleteStore();
    return () =>
      deleteStore.confirmOpen ? (
        <ConfirmPopover
          style={{
            top: `${deleteStore.confirmPosition.top}px`,
            left: `${deleteStore.confirmPosition.left}px`,
          }}
          title="删除记录？"
          message="这条记录带有批注，删除后批注一起消失。"
          confirmLabel="删除"
          cancelLabel="取消"
          onConfirm={deleteStore.confirmDelete}
          onCancel={deleteStore.cancelDelete}
        />
      ) : null;
  },
});
