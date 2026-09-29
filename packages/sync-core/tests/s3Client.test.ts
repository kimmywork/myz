import { describe, expect, it } from "vitest"
import { S3Client } from "../src/s3Client"

const base = {
  endpoint: "",
  region: "us-east-1",
  bucket: "myz",
  accessKeyId: "AKIA",
  secretAccessKey: "secret",
  sessionToken: "",
  prefix: "",
}

describe("S3Client endpoint policy", () => {
  it("rejects a non-https endpoint", () => {
    expect(
      () => new S3Client({ ...base, endpoint: "http://s3.example.com" }),
    ).toThrow(/HTTPS/)
    expect(
      () => new S3Client({ ...base, endpoint: "s3.example.com" }),
    ).toThrow(/HTTPS/)
  })

  it("accepts an https endpoint", () => {
    expect(
      () => new S3Client({ ...base, endpoint: "https://s3.example.com" }),
    ).not.toThrow()
  })

  it("allows loopback http for local dev/tests only", () => {
    expect(
      () => new S3Client({ ...base, endpoint: "http://localhost:9000" }),
    ).not.toThrow()
    expect(
      () => new S3Client({ ...base, endpoint: "http://127.0.0.1:9000" }),
    ).not.toThrow()
    expect(
      () => new S3Client({ ...base, endpoint: "http://[::1]:9000" }),
    ).not.toThrow()
    expect(
      () => new S3Client({ ...base, endpoint: "http://192.168.1.10:9000" }),
    ).toThrow(/HTTPS/)
  })

  it("allows an empty endpoint for unconfigured clients", () => {
    expect(() => new S3Client({ ...base, endpoint: "" })).not.toThrow()
  })
})
