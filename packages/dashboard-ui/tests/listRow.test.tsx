import { describe, expect, it, vi } from "vitest"
import { createApp, defineComponent, nextTick } from "vue"
import ListRow from "../src/ListRow"

function mountRow(props: Record<string, unknown> = {}) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const onOpen = vi.fn()
  const Wrapper = defineComponent({
    setup() {
      return () => (
        <ListRow title="一条被截断的长正文" meta="sspai.com · 11-10" {...props} onOpen={onOpen}>
          {{
            leading: () => <input type="checkbox" aria-label="选择" />,
            actions: () => <button type="button">保留</button>,
          }}
        </ListRow>
      )
    },
  })
  createApp(Wrapper).mount(host)
  return { host, onOpen, cleanup: () => host.remove() }
}

describe("ListRow", () => {
  it("renders one truncated title line with a tooltip and a meta line", () => {
    const { host, cleanup } = mountRow()
    const title = host.querySelector(".myz-list-row__title")
    expect(title?.textContent).toBe("一条被截断的长正文")
    expect(title?.getAttribute("title")).toBe("一条被截断的长正文")
    expect(host.querySelector(".myz-list-row__meta")?.textContent).toContain(
      "sspai.com",
    )
    expect(host.querySelector('[role="option"]')).toBeTruthy()
    cleanup()
  })

  it("reflects active, selected, disabled and tone", () => {
    const { host, cleanup } = mountRow({
      active: true,
      selected: true,
      disabled: true,
      tone: "clip",
    })
    const row = host.querySelector(".myz-list-row")
    expect(row?.classList.contains("is-active")).toBe(true)
    expect(row?.classList.contains("is-selected")).toBe(true)
    expect(row?.classList.contains("is-disabled")).toBe(true)
    expect(row?.getAttribute("aria-selected")).toBe("true")
    expect(row?.getAttribute("tabindex")).toBe("-1")
    expect(host.querySelector(".myz-list-row__bar--clip")).toBeTruthy()
    cleanup()
  })

  it("opens on a row click but not on an action click", async () => {
    const { host, onOpen, cleanup } = mountRow()
    const row = host.querySelector<HTMLElement>(".myz-list-row")
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(onOpen).toHaveBeenCalledTimes(1)

    const action = host.querySelector<HTMLElement>("button")
    action?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it("opens with Enter / Space and ignores clicks when disabled", async () => {
    const { host, onOpen, cleanup } = mountRow()
    const row = host.querySelector<HTMLElement>(".myz-list-row")
    row?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await nextTick()
    expect(onOpen).toHaveBeenCalledTimes(1)
    cleanup()

    const disabled = mountRow({ disabled: true })
    disabled.host
      .querySelector<HTMLElement>(".myz-list-row")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(disabled.onOpen).not.toHaveBeenCalled()
    disabled.cleanup()
  })
})
