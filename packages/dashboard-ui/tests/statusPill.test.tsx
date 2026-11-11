import { describe, expect, it } from "vitest"
import { createSSRApp, h } from "vue"
import { renderToString } from "vue/server-renderer"
import StatusPill from "../src/StatusPill"

function render(props: Record<string, unknown>) {
  return renderToString(
    createSSRApp({ render: () => h(StatusPill as never, props) }),
  )
}

describe("StatusPill", () => {
  it("renders the label with the semantic tone", async () => {
    const html = await render({ label: "待处理", tone: "info" })
    expect(html).toContain("待处理")
    expect(html).toContain("bg-info-bg")
    expect(html).toContain("text-info")
  })

  it("supports the three sizes and the bordered count variant", async () => {
    expect(await render({ label: "3", size: "count" })).toContain("border-line")
    expect(await render({ label: "已归档", tone: "neutral", size: "row" })).toContain(
      "h-[18px]",
    )
    expect(await render({ label: "已归档", tone: "neutral", size: "panel" })).toContain(
      "h-5",
    )
  })
})
