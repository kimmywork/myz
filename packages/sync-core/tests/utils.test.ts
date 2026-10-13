import { describe, expect, it } from "vitest"
import {
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  decodeBinaryPayload,
  encodeBinaryPayload,
} from "../src/utils"

describe("base64 transfer helpers", () => {
  // 251/255/255 encode to "+///" in the standard alphabet.
  const special = new Uint8Array([251, 255, 255])
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])

  it("round-trips standard base64", () => {
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(
      Array.from(bytes),
    )
  })

  it("emits URL-safe, unpadded base64 and decodes it", () => {
    const url = bytesToBase64Url(special)
    expect(url).not.toMatch(/[+/=]/)
    expect(url).toBe("-___")
    expect(Array.from(base64ToBytes(url))).toEqual(Array.from(special))
  })

  it("ignores whitespace and missing padding", () => {
    const raw = bytesToBase64(bytes).replace(/=+$/, "")
    const spaced = `  ${raw.slice(0, 8)}\n${raw.slice(8)}\t `
    expect(Array.from(base64ToBytes(spaced))).toEqual(Array.from(bytes))
  })

  it("throws a descriptive error for truncated or invalid input", () => {
    expect(() => base64ToBytes("HY/LbsIwE")).toThrow(/长度不完整/)
    expect(() => base64ToBytes("not a real invite!!")).toThrow(/非法字符/)
    expect(() => base64ToBytes("   ")).toThrow(/内容为空/)
  })

  it("round-trips an encoded binary payload", () => {
    const payload = { offer: { accountId: "acct" }, s3: { bucket: "b" } }
    expect(decodeBinaryPayload(encodeBinaryPayload(payload))).toEqual(payload)
  })
})
