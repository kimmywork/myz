import { defineComponent } from "vue"
import type { PropType } from "vue"

/**
 * Batch selection bar (§4.31): count on the left, actions on the right with
 * the dangerous one last. Purely presentational — hosts own the selection
 * state and pass the actions through the `actions` slot.
 *
 * `total` is the size of the current view (after filters); `count` may be
 * smaller because "select all" only covers the rendered page.
 */
export default defineComponent({
  name: "SelectionBar",
  props: {
    count: { type: Number, required: true },
    total: { type: Number, required: true },
    allSelected: { type: Boolean, default: false },
    onToggleAll: Function as PropType<() => void>,
    onClear: Function as PropType<() => void>,
  },
  setup(props, { slots }) {
    return () => (
      <div
        class="flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2"
        role="toolbar"
        aria-label="批量操作"
        data-testid="selection-bar"
      >
        <label class="inline-flex items-center gap-2 text-caption text-text">
          <input
            type="checkbox"
            class="h-4 w-4 shrink-0"
            checked={props.allSelected}
            onChange={() => props.onToggleAll?.()}
            aria-label="全选当前页"
          />
          <span>
            已选 {props.count}（共 {props.total}）
          </span>
        </label>
        <button
          type="button"
          class="btn-link text-caption"
          onClick={() => props.onClear?.()}
        >
          取消选择
        </button>
        <span class="flex-1" />
        <div class="flex flex-wrap items-center gap-2">
          {slots.actions?.()}
        </div>
      </div>
    )
  },
})
