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
    if (endpoint && !/^https:\/\//i.test(endpoint)) {
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
    const url = `${this.endpoint}/${this.bucket}?list-type=2&prefix=${encodeURIComponent(
      listPrefix,
    )}`
    const response = await this.fetchSigned("GET", url)
    if (!response.ok) {
      if (response.status === 404) return []
      throw new Error(`S3 list failed: ${response.status}`)
    }
    const text = await response.text()
    return parseListObjects(text)
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
    a.localeCompare(b),
  )
  return entries
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&")
}

function canonicalizePath(pathname: string) {
  return pathname
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
}

function parseListObjects(xml: string): S3ObjectInfo[] {
  const results: S3ObjectInfo[] = []
  const regex =
    /<Contents>[\s\S]*?<Key>([^<]+)<\/Key>[\s\S]*?<LastModified>([^<]+)<\/LastModified>[\s\S]*?<ETag>([^<]+)<\/ETag>[\s\S]*?<Size>([^<]+)<\/Size>[\s\S]*?<\/Contents>/g
  let match = regex.exec(xml)
  while (match) {
    results.push({
      key: match[1],
      lastModified: match[2],
      etag: match[3],
      size: Number(match[4]),
    })
    match = regex.exec(xml)
  }
  return results
}
