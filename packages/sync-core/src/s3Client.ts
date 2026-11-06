import { hmacSha256, sha256, utf8ToBytes } from "./crypto"
import type { SyncS3Settings } from "./settings"
import { bytesToHex, toArrayBuffer } from "./utils"

export interface S3ObjectInfo {
  key: string
  lastModified?: string
  etag?: string
  size?: number
}

export interface S3PutOptions {
  contentType?: string
  metadata?: Record<string, string>
  ifMatch?: string
  ifNoneMatch?: string
}

export interface S3DeleteOptions {
  ifMatch?: string
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

/**
 * HTTPS is required for real endpoints; loopback HTTP is allowed so local
 * development / tests can run a plain mock S3 without certificates.
 */
export function isAllowedEndpoint(endpoint: string): boolean {
  if (/^https:\/\//i.test(endpoint)) return true
  try {
    const url = new URL(endpoint)
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

const EMPTY_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

export class S3Client {
  private endpoint: string
  private region: string
  private bucket: string
  private accessKeyId: string
  private secretAccessKey: string
  private sessionToken?: string
  private prefix?: string

  constructor(config: SyncS3Settings) {
    const endpoint = (config.endpoint || "").trim()
    if (endpoint && !isAllowedEndpoint(endpoint)) {
      throw new Error("S3 endpoint must use HTTPS")
    }
    this.endpoint = endpoint.replace(/\/$/, "")
    this.region = config.region || "us-east-1"
    this.bucket = config.bucket
    this.accessKeyId = config.accessKeyId
    this.secretAccessKey = config.secretAccessKey
    this.sessionToken = config.sessionToken || undefined
    this.prefix = config.prefix || ""
  }

  buildKey(path: string) {
    const prefix = this.prefix ? this.prefix.replace(/^\/+|\/+$/g, "") : ""
    const cleanPath = path.replace(/^\/+/, "")
    if (!prefix) return cleanPath
    if (cleanPath === prefix || cleanPath.startsWith(`${prefix}/`)) {
      return cleanPath
    }
    return `${prefix}/${cleanPath}`
  }

  buildUrl(path: string): string {
    const key = this.buildKey(path)
    return `${this.endpoint}/${this.bucket}/${encodePath(key)}`
  }

  async listObjects(prefix: string): Promise<S3ObjectInfo[]> {
    const listPrefix = this.buildKey(prefix)
    const objects: S3ObjectInfo[] = []
    let continuationToken: string | undefined
    do {
      // S3 pages listings at 1000 keys; follow IsTruncated so callers never
      // silently work on a partial view (e.g. picking an old stream manifest).
      const url = `${this.endpoint}/${this.bucket}?${buildListQuery(
        listPrefix,
        continuationToken,
      )}`
      const response = await this.fetchSigned("GET", url)
      if (!response.ok) {
        if (response.status === 404) return []
        throw new Error(`S3 list failed: ${response.status}`)
      }
      const page = parseListObjects(await response.text())
      objects.push(...page.objects)
      continuationToken = page.nextContinuationToken
    } while (continuationToken)
    return objects
  }

  async getObject(
    path: string,
  ): Promise<{ body: Uint8Array; etag?: string } | null> {
    const url = this.buildUrl(path)
    const response = await this.fetchSigned("GET", url)
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`S3 get failed: ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    const etag = response.headers.get("etag") || undefined
    return { body: new Uint8Array(arrayBuffer), etag }
  }

  async headObject(path: string): Promise<{ etag?: string } | null> {
    const url = this.buildUrl(path)
    const response = await this.fetchSigned("HEAD", url)
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`S3 head failed: ${response.status}`)
    }
    const etag = response.headers.get("etag") || undefined
    return { etag }
  }

  async putObject(
    path: string,
    body: Uint8Array,
    options: S3PutOptions = {},
  ): Promise<void> {
    const url = this.buildUrl(path)
    const headers: Record<string, string> = {
      "content-type": options.contentType || "application/octet-stream",
    }
    if (options.metadata) {
      Object.entries(options.metadata).forEach(([key, value]) => {
        headers[`x-amz-meta-${key}`] = value
      })
    }
    if (options.ifMatch) {
      headers["if-match"] = options.ifMatch
    }
    if (options.ifNoneMatch) {
      headers["if-none-match"] = options.ifNoneMatch
    }
    const response = await this.fetchSigned("PUT", url, body, headers)
    if (!response.ok) {
      throw new Error(`S3 put failed: ${response.status}`)
    }
  }

  async deleteObject(
    path: string,
    options: S3DeleteOptions = {},
  ): Promise<void> {
    const url = this.buildUrl(path)
    const headers: Record<string, string> = {}
    if (options.ifMatch) {
      headers["if-match"] = options.ifMatch
    }
    const response = await this.fetchSigned("DELETE", url, undefined, headers)
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 delete failed: ${response.status}`)
    }
  }

  private async fetchSigned(
    method: string,
    url: string,
    body?: Uint8Array,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const headers = await signRequest({
      method,
      url,
      body: body || new Uint8Array(),
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      sessionToken: this.sessionToken,
      headers: extraHeaders,
    })
    return fetch(url, {
      method,
      headers,
      body: body && body.length ? toArrayBuffer(body) : undefined,
    })
  }
}

interface SignRequestInput {
  method: string
  url: string
  body: Uint8Array
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  headers?: Record<string, string>
}

async function signRequest(
  input: SignRequestInput,
): Promise<Record<string, string>> {
  const url = new URL(input.url)
  const amzDate = toAmzDate(new Date())
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = input.body.length
    ? bytesToHex(await sha256(input.body))
    : EMPTY_HASH

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    ...(input.headers || {}),
  }
  if (input.sessionToken) {
    headers["x-amz-security-token"] = input.sessionToken
  }

  const normalizedHeaders: Record<string, string> = {}
  Object.entries(headers).forEach(([key, value]) => {
    normalizedHeaders[key.toLowerCase()] = String(value).trim()
  })

  const canonicalHeaders = Object.keys(normalizedHeaders)
    .sort()
    .map((key) => `${key}:${normalizedHeaders[key]}`)
    .join("\n")
  const signedHeaders = Object.keys(normalizedHeaders).sort().join(";")
  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalizePath(url.pathname),
    canonicalizeQuery(url.searchParams),
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n")
  const canonicalRequestHash = bytesToHex(
    await sha256(utf8ToBytes(canonicalRequest)),
  )
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n")
  const signingKey = await getSigningKey(
    input.secretAccessKey,
    dateStamp,
    input.region,
  )
  const signature = bytesToHex(
    await hmacSha256(signingKey, utf8ToBytes(stringToSign)),
  )
  normalizedHeaders["authorization"] =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`
  return normalizedHeaders
}

async function getSigningKey(secret: string, date: string, region: string) {
  const kDate = await hmacSha256(
    utf8ToBytes(`AWS4${secret}`),
    utf8ToBytes(date),
  )
  const kRegion = await hmacSha256(kDate, utf8ToBytes(region))
  const kService = await hmacSha256(kRegion, utf8ToBytes("s3"))
  return hmacSha256(kService, utf8ToBytes("aws4_request"))
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]/g, "").replace(/\..+/, "") + "Z"
}

function canonicalizeQuery(params: URLSearchParams) {
  const entries = Array.from(params.entries()).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )
  return entries
    .map(([key, value]) => `${uriEncode(key)}=${uriEncode(value)}`)
    .join("&")
}

/**
 * SigV4's URI encoding: everything but `A-Z a-z 0-9 - . _ ~` is percent-encoded,
 * which is stricter than `encodeURIComponent` (it also escapes `!'()*`). URLs
 * are built with the same encoder the signature uses, so the bytes sent match
 * the bytes signed.
 */
function uriEncode(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/**
 * The path is signed exactly as it is sent: percent-encode each segment, but do
 * not re-encode escapes that are already there (`%20` must stay `%20`, not
 * become `%2520`) — S3, unlike the other AWS services, does not double-encode.
 */
function canonicalizePath(pathname: string) {
  return pathname.split("/").map(decodePathSegment).map(uriEncode).join("/")
}

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function encodePath(path: string) {
  return path.split("/").map(uriEncode).join("/")
}

function buildListQuery(prefix: string, continuationToken?: string) {
  const query = [`list-type=2`, `prefix=${uriEncode(prefix)}`]
  if (continuationToken) {
    query.push(`continuation-token=${uriEncode(continuationToken)}`)
  }
  return query.join("&")
}

const CONTENTS_BLOCK = /<Contents>([\s\S]*?)<\/Contents>/g
const TRUNCATED_FLAG = /<IsTruncated>\s*true\s*<\/IsTruncated>/i
const NEXT_TOKEN = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/

/**
 * S3-compatible stores (AWS, MinIO, R2, fakes3) are free to serialise the
 * children of `<Contents>` in any order, so each field is matched on its own
 * instead of assuming Key → LastModified → ETag → Size.
 */
const CONTENTS_TAGS = {
  key: /<Key>([\s\S]*?)<\/Key>/,
  lastModified: /<LastModified>([\s\S]*?)<\/LastModified>/,
  etag: /<ETag>([\s\S]*?)<\/ETag>/,
  size: /<Size>([\s\S]*?)<\/Size>/,
} as const

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g,
    (entity, body: string) => {
      if (body.startsWith("#")) {
        const hex = body[1] === "x" || body[1] === "X"
        const codePoint = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
        // The listing comes from the remote store: never let a hostile entity
        // (e.g. `&#x110000;`) make String.fromCodePoint throw.
        const valid =
          Number.isInteger(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10ffff
        return valid ? String.fromCodePoint(codePoint) : entity
      }
      return XML_ENTITIES[body] ?? entity
    },
  )
}

function tagText(block: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(block)
  return match ? decodeXmlEntities(match[1]) : undefined
}

function parseListObjects(xml: string): {
  objects: S3ObjectInfo[]
  nextContinuationToken?: string
} {
  const objects: S3ObjectInfo[] = []
  for (const [, block] of xml.matchAll(CONTENTS_BLOCK)) {
    const key = tagText(block, CONTENTS_TAGS.key)
    if (key === undefined) continue
    const size = tagText(block, CONTENTS_TAGS.size)
    objects.push({
      key,
      lastModified: tagText(block, CONTENTS_TAGS.lastModified),
      etag: tagText(block, CONTENTS_TAGS.etag),
      size: size === undefined ? undefined : Number(size),
    })
  }
  const nextContinuationToken = TRUNCATED_FLAG.test(xml)
    ? tagText(xml, NEXT_TOKEN)
    : undefined
  return { objects, nextContinuationToken }
}

