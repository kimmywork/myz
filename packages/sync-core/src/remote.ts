import { splitNoncePayload, bytesToUtf8, utf8ToBytes } from "./crypto"
import { decryptRecordPayload, decryptChunkEnvelope } from "./chunks"
import { decryptManifest, verifyManifest } from "./manifest"
import { decodeBinaryPayload } from "./utils"
import type {
  ManifestRecordEntry,
  SyncRecordPayload,
} from "./types"
import type {
  SyncObjectStore,
  SyncRemoteKeyset,
  SyncRemoteManifestSnapshot,
} from "./adapters"
import { SYNC_PROTOCOL_VERSION } from "@myz/shared/versioning"

export function formatManifestVersion(version: number) {
  return `v${String(version).padStart(10, "0")}`
}

export function parseManifestVersion(key: string): number | null {
  const match = key.match(/v(\d+)\.bin$/)
  if (!match) return null
  return Number(match[1])
}

export async function readRemoteVersion(
  store: SyncObjectStore,
  keyId: string,
): Promise<number | null> {
  const payload = await store.getObject(`${keyId}/meta/version.bin`)
  if (!payload) return null
  const text = bytesToUtf8(payload.body).trim()
  const parsed = Number.parseInt(text, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export async function writeRemoteVersion(
  store: SyncObjectStore,
  keyId: string,
  version: number,
  updatedAt: string,
): Promise<void> {
  await store.putObject(`${keyId}/meta/version.bin`, utf8ToBytes(String(version)), {
    metadata: { "updated-at": updatedAt },
  })
}

export async function loadRemoteManifest(
  store: SyncObjectStore,
  keyId: string,
  keyset: SyncRemoteKeyset,
  versionHint?: number | null,
): Promise<SyncRemoteManifestSnapshot | null> {
  if (typeof versionHint === "number" && versionHint > 0) {
    const manifestPath = `${keyId}/manifests/${formatManifestVersion(versionHint)}.bin`
    const manifestPayload = await store.getObject(manifestPath)
    if (manifestPayload) {
      const signaturePath = manifestPath.replace(/\.bin$/, ".sig")
      const signaturePayload = await store.getObject(signaturePath)
      if (!signaturePayload) {
        throw new Error("Missing manifest signature")
      }
      const { manifest, plainBytes } = await decryptManifest(
        manifestPayload.body,
        versionHint,
        keyset.masterKey,
      )
      const valid = await verifyManifest(
        plainBytes,
        signaturePayload.body,
        keyset.publicKey,
      )
      if (!valid) {
        throw new Error("Invalid manifest signature")
      }
      if (manifest.protocolVersion !== SYNC_PROTOCOL_VERSION) {
        throw new Error("Unsupported sync manifest protocol version")
      }
      return {
        manifest,
        version: versionHint,
        manifestPath,
        signaturePath,
      }
    }
  }

  const manifestObjects = await store.listObjects(`${keyId}/manifests/`)
  if (!manifestObjects.length) return null

  const versions = manifestObjects
    .map((entry) => ({ key: entry.key, version: parseManifestVersion(entry.key) }))
    .filter((entry) => Number.isFinite(entry.version))
    .sort((a, b) => (b.version || 0) - (a.version || 0))

  const latest = versions[0]
  if (!latest || latest.version === null) return null

  const manifestPayload = await store.getObject(latest.key)
  if (!manifestPayload) return null

  const signaturePath = latest.key.replace(/\.bin$/, ".sig")
  const signaturePayload = await store.getObject(signaturePath)
  if (!signaturePayload) {
    throw new Error("Missing manifest signature")
  }

  const { manifest, plainBytes } = await decryptManifest(
    manifestPayload.body,
    latest.version,
    keyset.masterKey,
  )
  const valid = await verifyManifest(
    plainBytes,
    signaturePayload.body,
    keyset.publicKey,
  )
  if (!valid) {
    throw new Error("Invalid manifest signature")
  }
  if (manifest.protocolVersion !== SYNC_PROTOCOL_VERSION) {
    throw new Error("Unsupported sync manifest protocol version")
  }

  return {
    manifest,
    version: latest.version,
    manifestPath: latest.key,
    signaturePath,
  }
}

export async function fetchRemoteRecords(
  store: SyncObjectStore,
  masterKey: Uint8Array,
  keyId: string,
  records: Map<string, ManifestRecordEntry>,
): Promise<SyncRecordPayload[]> {
  const payloads: SyncRecordPayload[] = []
  for (const [recordId, entry] of records.entries()) {
    const chunkPayload = await store.getObject(`${keyId}/chunks/${entry.chunkId}.bin`)
    if (!chunkPayload) continue
    const { nonce, ciphertext } = splitNoncePayload(chunkPayload.body, 12)
    const envelope = await decryptChunkEnvelope(
      masterKey,
      entry.chunkId,
      nonce,
      ciphertext,
    )
    if (envelope.recordId !== recordId) continue
    const recordBytes = await decryptRecordPayload(masterKey, envelope)
    payloads.push(decodeBinaryPayload(recordBytes) as SyncRecordPayload)
  }
  return payloads
}
