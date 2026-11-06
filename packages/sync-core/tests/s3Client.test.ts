import { afterEach, describe, expect, it, vi } from "vitest"
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

describe("S3Client listObjects", () => {
  const client = () =>
    new S3Client({ ...base, endpoint: "https://s3.example.com", prefix: "" })

  // Element order inside <Contents> is not fixed by the API: S3-compatible
  // stores differ (AWS is Key-first, fakes3/S3s is alphabetical, MinIO/R2 have
  // their own order), so the parser must not depend on it.
  const alphabetical =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
    `<Name>myz</Name><Prefix>a/</Prefix><KeyCount>2</KeyCount>` +
    `<Contents><ETag>"abc"</ETag><Key>a/1</Key>` +
    `<LastModified>2026-01-02T03:04:05.000Z</LastModified><Size>12</Size>` +
    `<StorageClass>STANDARD</StorageClass></Contents>` +
    `<Contents><ETag>"def"</ETag><Key>a/2</Key>` +
    `<LastModified>2026-01-02T03:04:06.000Z</LastModified><Size>34</Size>` +
    `<StorageClass>STANDARD</StorageClass></Contents>` +
    `<IsTruncated>false</IsTruncated></ListBucketResult>`

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("parses contents whatever order the store emits the fields in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(alphabetical, { status: 200 })),
    )

    await expect(client().listObjects("a/")).resolves.toEqual([
      {
        key: "a/1",
        lastModified: "2026-01-02T03:04:05.000Z",
        etag: '"abc"',
        size: 12,
      },
      {
        key: "a/2",
        lastModified: "2026-01-02T03:04:06.000Z",
        etag: '"def"',
        size: 34,
      },
    ])
  })

  it("decodes XML entities in keys and survives absent fields", async () => {
    const xml =
      `<ListBucketResult><Contents><Key>a/&amp;b&#38;c</Key></Contents>` +
      `</ListBucketResult>`
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(xml, { status: 200 })),
    )

    await expect(client().listObjects("a/")).resolves.toEqual([
      {
        key: "a/&b&c",
        lastModified: undefined,
        etag: undefined,
        size: undefined,
      },
    ])
  })

  it("keeps unparseable entities verbatim instead of throwing", async () => {
    // A remote store is a trust boundary: out-of-range code points and unknown
    // named entities must not abort the listing.
    const xml =
      `<ListBucketResult><Contents><Key>a/&#x110000;&nbsp;</Key></Contents>` +
      `</ListBucketResult>`
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(xml, { status: 200 })),
    )

    const objects = await client().listObjects("a/")

    expect(objects.map((object) => object.key)).toEqual([
      "a/&#x110000;&nbsp;",
    ])
  })

  it("follows continuation tokens until the listing is complete", async () => {
    const urls: string[] = []
    const pages = [
      `<ListBucketResult><Contents><Key>p/1</Key></Contents>` +
        `<IsTruncated>true</IsTruncated>` +
        `<NextContinuationToken>tok+1</NextContinuationToken></ListBucketResult>`,
      `<ListBucketResult><Contents><Key>p/2</Key></Contents>` +
        `<IsTruncated>false</IsTruncated></ListBucketResult>`,
    ]
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url)
        return new Response(pages[urls.length - 1], { status: 200 })
      }),
    )

    const objects = await client().listObjects("p")

    expect(objects.map((object) => object.key)).toEqual(["p/1", "p/2"])
    expect(urls).toHaveLength(2)
    expect(urls[0]).toContain("list-type=2&prefix=p")
    expect(urls[1]).toContain("continuation-token=tok%2B1")
  })

  it("returns an empty list when the bucket does not exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    )

    await expect(client().listObjects("a/")).resolves.toEqual([])
  })
})
