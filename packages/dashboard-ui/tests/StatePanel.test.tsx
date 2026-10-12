import { describe, expect, it } from "vitest"
import { createSSRApp, h } from "vue"
import { renderToString } from "vue/server-renderer"
import StatePanel from "../src/StatePanel"

function render(props: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({ render: () => h(StatePanel as never, props) })
  return renderToString(app)
}

describe("StatePanel", () => {
  it("renders the empty state title and hint", async () => {
    const html = await render({
      kind: "empty",
      title: "Nothing here",
      hint: "Add a highlight",
    })
    expect(html).toContain("Nothing here")
    expect(html).toContain("Add a highlight")
  })

  it("renders a loading skeleton", async () => {
    const html = await render({ kind: "loading" })
    expect(html).toContain("animate-pulse")
  })

  it("renders an action button only when both label and handler exist", async () => {
    const withAction = await render({
      kind: "error",
      title: "Oops",
      actionLabel: "Retry",
      onAction: () => {},
    })
    expect(withAction).toContain("Retry")

    const withoutAction = await render({
      kind: "error",
      title: "Oops",
      actionLabel: "Retry",
    })
    expect(withoutAction).not.toContain("Retry")
  })
})
