import { describe, expect, it } from "vitest"
import { cjkRegionFromLanguage } from "../src/cjk"

describe("cjkRegionFromLanguage", () => {
  it("maps Simplified Chinese locales to sc", () => {
    expect(cjkRegionFromLanguage("zh-CN")).toBe("sc")
    expect(cjkRegionFromLanguage("zh-SG")).toBe("sc")
    expect(cjkRegionFromLanguage("zh")).toBe("sc")
  })

  it("maps Traditional Chinese locales to tc", () => {
    expect(cjkRegionFromLanguage("zh-TW")).toBe("tc")
    expect(cjkRegionFromLanguage("zh-Hant")).toBe("tc")
  })

  it("maps Hong Kong / Macau locales to hk", () => {
    expect(cjkRegionFromLanguage("zh-HK")).toBe("hk")
    expect(cjkRegionFromLanguage("zh-MO")).toBe("hk")
    expect(cjkRegionFromLanguage("zh-Hant-HK")).toBe("hk")
  })

  it("maps Japanese and Korean to jp / kr", () => {
    expect(cjkRegionFromLanguage("ja")).toBe("jp")
    expect(cjkRegionFromLanguage("ja-JP")).toBe("jp")
    expect(cjkRegionFromLanguage("ko")).toBe("kr")
    expect(cjkRegionFromLanguage("ko-KR")).toBe("kr")
  })

  it("falls back to sc for other or missing languages", () => {
    expect(cjkRegionFromLanguage("en-US")).toBe("sc")
    expect(cjkRegionFromLanguage("fr")).toBe("sc")
    expect(cjkRegionFromLanguage("")).toBe("sc")
    expect(cjkRegionFromLanguage(undefined)).toBe("sc")
    expect(cjkRegionFromLanguage(null)).toBe("sc")
  })
})
