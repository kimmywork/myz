import type {
  SyncDeleteOptions,
  SyncGetObjectResult,
  SyncObjectInfo,
  SyncObjectStore,
  SyncPutOptions,
} from "../../src/adapters"

interface StoredObject {
  body: Uint8Array
  etag: string
  lastModified: string
}

export class InMemoryObjectStore implements SyncObjectStore {
  private objects = new Map<string, StoredObject>()
  private counter = 0

  private nextEtag() {
    this.counter += 1
    return `"etag-${this.counter}"`
  }

  async listObjects(prefix: string): Promise<SyncObjectInfo[]> {
    return Array.from(this.objects.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({
        key,
        etag: value.etag,
        lastModified: value.lastModified,
        size: value.body.length,
      }))
  }

  async getObject(path: string): Promise<SyncGetObjectResult | null> {
    const entry = this.objects.get(path)
    if (!entry) return null
    return { body: entry.body, etag: entry.etag }
  }

  async putObject(
    path: string,
    body: Uint8Array,
    options: SyncPutOptions = {},
  ): Promise<void> {
    const current = this.objects.get(path)
    if (options.ifNoneMatch === "*" && current) {
      throw new Error("S3 put failed: 412")
    }
    if (options.ifMatch !== undefined && current?.etag !== options.ifMatch) {
      throw new Error("S3 put failed: 412")
    }
    this.objects.set(path, {
      body,
      etag: this.nextEtag(),
      lastModified: new Date().toISOString(),
    })
  }

  async deleteObject(
    path: string,
    options: SyncDeleteOptions = {},
  ): Promise<void> {
    const current = this.objects.get(path)
    if (!current) return
    if (options.ifMatch !== undefined && current.etag !== options.ifMatch) {
      throw new Error("S3 delete failed: 412")
    }
    this.objects.delete(path)
  }

  has(path: string): boolean {
    return this.objects.has(path)
  }

  rawEtag(path: string): string | undefined {
    return this.objects.get(path)?.etag
  }
}
