import { RECORD_KINDS } from "@myz/shared"
import { recordKindLabel } from "@myz/shared/recordDisplay"
import { describe, expect, it } from "vitest"
import { getKindLabel } from "../src/highlightMeta"

describe("highlightMeta.getKindLabel", () => {
  it("matches the shared canonical labels", () => {
    for (const kind of Object.values(RECORD_KINDS)) {
      expect(getKindLabel(kind)).toBe(recordKindLabel(kind))
    }
  })

  it("labels clips, bookmarks and highlights", () => {
    expect(getKindLabel(RECORD_KINDS.CLIP)).toBe("摘录")
    expect(getKindLabel(RECORD_KINDS.BOOKMARK)).toBe("来源")
    expect(getKindLabel(RECORD_KINDS.HIGHLIGHT)).toBe("划线")
  })
})
