import { describe, expect, it } from "vitest"
import { createApp, defineComponent, nextTick, ref } from "vue"
import ResizeHandle from "../src/workspace/ResizeHandle"

const MIN = 200
const MAX = 320
const DEFAULT = 240

function mountHandle(initial: number) {
  const width = ref(initial)
  const host = document.createElement("div")
  document.body.appendChild(host)

  const Wrapper = defineComponent({
    name: "HandleWrapper",
    setup() {
      return () => (
        <ResizeHandle
          width={width.value}
          min={MIN}
          max={MAX}
          defaultValue={DEFAULT}
          label="导航栏宽度"
          onResize={(next: number) => {
            width.value = next
          }}
          onReset={() => {
            width.value = DEFAULT
          }}
          onToggleCollapse={() => {
            width.value = width.value > 0 ? 0 : DEFAULT
          }}
        />
      )
    },
  })

  createApp(Wrapper).mount(host)
  const el = host.querySelector<HTMLElement>('[role="separator"]')
  if (!el) {
    throw new Error("separator not rendered")
  }
  return {
    el,
    width,
    cleanup: () => {
      host.remove()
    },
  }
}

async function press(el: HTMLElement, key: string) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
  await nextTick()
}

describe("WorkspaceResizeHandle", () => {
  it("exposes the accessibility contract", () => {
    const { el, cleanup } = mountHandle(DEFAULT)
    expect(el.getAttribute("role")).toBe("separator")
    expect(el.getAttribute("aria-orientation")).toBe("vertical")
    expect(el.getAttribute("aria-valuemin")).toBe(String(MIN))
    expect(el.getAttribute("aria-valuemax")).toBe(String(MAX))
    expect(el.getAttribute("aria-valuenow")).toBe(String(DEFAULT))
    expect(el.getAttribute("aria-valuetext")).toContain("导航栏宽度")
    cleanup()
  })

  it("resizes by 8px with the arrow keys and clamps", async () => {
    const { el, width, cleanup } = mountHandle(MAX - 4)
    await press(el, "ArrowRight")
    expect(width.value).toBe(MAX)
    await press(el, "ArrowLeft")
    expect(width.value).toBe(312)
    cleanup()
  })

  it("resets with Home and toggles collapse with Enter", async () => {
    const { el, width, cleanup } = mountHandle(300)
    await press(el, "Home")
    expect(width.value).toBe(DEFAULT)
    await press(el, "Enter")
    expect(width.value).toBe(0)
    await nextTick()
    expect(el.getAttribute("aria-valuenow")).toBe("0")
    expect(el.getAttribute("aria-valuetext")).toContain("已收起")
    await press(el, "Enter")
    expect(width.value).toBe(DEFAULT)
    cleanup()
  })

  it("drags within the clamp bounds and stops on pointerup", async () => {
    const { el, width, cleanup } = mountHandle(DEFAULT)
    el.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 500, button: 0, bubbles: true }),
    )
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 530 }))
    await nextTick()
    expect(width.value).toBe(270)
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 900 }))
    await nextTick()
    expect(width.value).toBe(MAX)
    window.dispatchEvent(new MouseEvent("pointerup", {}))
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100 }))
    await nextTick()
    expect(width.value).toBe(MAX)
    cleanup()
  })
})
