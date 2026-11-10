import { computed, defineComponent, onBeforeUnmount } from "vue"
import type { PropType } from "vue"
import { WIDTH_STEP, clampWidth } from "./width.js"

/**
 * Draggable vertical separator between two workspace columns (§4.27).
 *
 * Visible width is 4px and the hit area is 12px (via CSS). Pointer dragging,
 * double-click reset and keyboard control (←/→, Home, Enter) are handled here;
 * the owning shell keeps the width state.
 */
export default defineComponent({
  name: "WorkspaceResizeHandle",
  props: {
    /** Current column width in px; 0 means collapsed. */
    width: { type: Number, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    defaultValue: { type: Number, required: true },
    /** Accessible name, e.g. "导航栏宽度". */
    label: { type: String, required: true },
    /** Right-hand columns grow when dragging left, so arrows are mirrored. */
    invert: { type: Boolean, default: false },
    testId: { type: String, default: undefined },
    onResize: Function as PropType<(width: number) => void>,
    onReset: Function as PropType<() => void>,
    onToggleCollapse: Function as PropType<() => void>,
  },
  setup(props) {
    let dragging = false
    let startX = 0
    let startWidth = 0

    const ariaValueText = computed(() =>
      props.width > 0
        ? `${props.label} ${Math.round(props.width)} 像素`
        : `${props.label}已收起`,
    )

    function applyWidth(next: number) {
      props.onResize?.(clampWidth(next, props.min, props.max))
    }

    function endDrag() {
      if (!dragging) return
      dragging = false
      document.body.style.cursor = ""
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", endDrag)
      window.removeEventListener("pointercancel", endDrag)
    }

    function onPointerMove(event: PointerEvent) {
      if (!dragging) return
      const delta = props.invert
        ? startX - event.clientX
        : event.clientX - startX
      applyWidth(startWidth + delta)
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return
      dragging = true
      startX = event.clientX
      startWidth = props.width > 0 ? props.width : props.defaultValue
      document.body.style.cursor = "col-resize"
      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", endDrag)
      window.addEventListener("pointercancel", endDrag)
      event.preventDefault()
    }

    function onKeydown(event: KeyboardEvent) {
      const widenKey = props.invert ? "ArrowLeft" : "ArrowRight"
      const narrowKey = props.invert ? "ArrowRight" : "ArrowLeft"
      if (event.key === widenKey || event.key === narrowKey) {
        event.preventDefault()
        const base = props.width > 0 ? props.width : props.defaultValue
        applyWidth(base + (event.key === widenKey ? WIDTH_STEP : -WIDTH_STEP))
        return
      }
      if (event.key === "Home") {
        event.preventDefault()
        props.onReset?.()
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        props.onToggleCollapse?.()
      }
    }

    onBeforeUnmount(() => {
      endDrag()
    })

    return () => (
      <button
        type="button"
        class="myz-workspace__handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={props.label}
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        aria-valuenow={Math.round(props.width)}
        aria-valuetext={ariaValueText.value}
        data-testid={props.testId}
        onPointerdown={onPointerDown}
        onDblclick={() => props.onReset?.()}
        onKeydown={onKeydown}
      />
    )
  },
})
