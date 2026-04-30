import { defineComponent } from "vue"
import type { PropType } from "vue"

export default defineComponent({
  name: "ChatPageLayout",
  props: {
    renderSidebar: {
      type: Function as PropType<() => unknown>,
      required: true,
    },
    renderConversation: {
      type: Function as PropType<() => unknown>,
      required: true,
    },
    renderModals: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
  },
  setup(props) {
    return () => (
      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          {props.renderSidebar()}
          {props.renderConversation()}
        </div>
        {props.renderModals?.()}
      </div>
    )
  },
})
