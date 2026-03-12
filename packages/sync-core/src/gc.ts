import { decryptManifest } from "./manifest"
import type { S3Client } from "./s3Client"

const MANIFEST_PREFIX = "manifests/"
const CHUNKS_PREFIX = "chunks/"

export async function runGc(options: {
  client: S3Client
  keyId: string
  masterKey: Uint8Array
  keepCount: number
}): Promise<void> {
  const manifestObjects = await options.client.listObjects(
    `${options.keyId}/${MANIFEST_PREFIX}`,
  )
  const versions = manifestObjects
    .map((obj) => ({
      key: obj.key,
      version: parseManifestVersion(obj.key),
    }))
    .filter((entry) => Number.isFinite(entry.version))
    .sort((a, b) => (b.version || 0) - (a.version || 0))

  if (versions.length <= options.keepCount) {
    return
  }

  const keep = versions.slice(0, options.keepCount)
  const remove = versions.slice(options.keepCount)

  const activeChunks = new Set<string>()
  for (const entry of keep) {
    if (!entry.key || entry.version === null) continue
    const manifestPayload = await options.client.getObject(entry.key)
    if (!manifestPayload) continue
    const { manifest } = await decryptManifest(
      manifestPayload.body,
      entry.version,
      options.masterKey,
    )
    Object.keys(manifest.chunksIndex || {}).forEach((chunkId) => {
      activeChunks.add(chunkId)
    })
  }

  for (const entry of remove) {
    if (!entry.key) continue
    await options.client.deleteObject(entry.key)
    const sigKey = entry.key.replace(/\.bin$/, ".sig")
    await options.client.deleteObject(sigKey)
  }

  const chunkObjects = await options.client.listObjects(
    `${options.keyId}/${CHUNKS_PREFIX}`,
  )
  await Promise.all(
    chunkObjects.map(async (obj) => {
      const chunkId = obj.key.split("/").pop() || ""
      if (!chunkId || activeChunks.has(chunkId.replace(/\.bin$/, ""))) {
        return
      }
      await options.client.deleteObject(obj.key)
    }),
  )
}

function parseManifestVersion(key: string): number | null {
  const match = key.match(/v(\d+)\.bin$/)
  if (!match) return null
  return Number(match[1])
}
