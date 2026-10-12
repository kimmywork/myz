import { SYNC_PROTOCOL_VERSION_V2 } from "@myz/shared/versioning"
import type { SyncObjectStore } from "./adapters"
import type { DeviceKeyPair } from "./deviceKeys"
import type { Roster } from "./roster"
import { signStable, verifyStable } from "./signing"
import { streamPrefix } from "./streamManifest"
import { base64ToBytes, decodeBinaryPayload, encodeBinaryPayload } from "./utils"

/**
 * Per-device, per-stream sync watermark. Devices publish the streamVersion
 * they have fully applied so a stream can reclaim tombstones only once every
 * authorized device has passed them (avoiding resurrection by a stale device).
 * Acks live outside the manifest so writing one does not bump the stream.
 */
export interface StreamAck {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION_V2
  accountId: string
  streamId: string
  deviceId: string
  streamVersion: number
  updatedAt: string
  signature: string
}

export function streamAckPath(
  accountId: string,
  streamId: string,
  deviceId: string,
): string {
  return `${streamPrefix(accountId, streamId)}/acks/${deviceId}.bin`
}

export async function writeStreamAck(
  store: SyncObjectStore,
  options: {
    accountId: string
    streamId: string
    device: DeviceKeyPair
    deviceId: string
    streamVersion: number
    now?: string
  },
): Promise<void> {
  const unsigned = {
    protocolVersion: SYNC_PROTOCOL_VERSION_V2,
    accountId: options.accountId,
    streamId: options.streamId,
    deviceId: options.deviceId,
    streamVersion: options.streamVersion,
    updatedAt: options.now ?? new Date().toISOString(),
  }
  const ack: StreamAck = {
    ...unsigned,
    signature: await signStable(unsigned, options.device.signPrivateKey),
  }
  await store.putObject(
    streamAckPath(options.accountId, options.streamId, options.deviceId),
    encodeBinaryPayload(ack),
    { metadata: { "updated-at": ack.updatedAt } },
  )
}

/** Read verified acks for authorized (non-revoked) roster devices. */
export async function readStreamAcks(
  store: SyncObjectStore,
  options: { accountId: string; streamId: string; roster: Roster },
): Promise<Map<string, number>> {
  const prefix = `${streamPrefix(options.accountId, options.streamId)}/acks/`
  const objects = await store.listObjects(prefix)
  const result = new Map<string, number>()
  for (const object of objects) {
    const payload = await store.getObject(object.key)
    if (!payload) continue
    let ack: StreamAck | null
    try {
      ack = decodeBinaryPayload(payload.body) as StreamAck | null
    } catch {
      continue
    }
    if (!ack) continue
    if (
      ack.accountId !== options.accountId ||
      ack.streamId !== options.streamId
    ) {
      continue
    }
    const device = options.roster.devices.find(
      (entry) => entry.deviceId === ack.deviceId && !entry.revokedAt,
    )
    if (!device) continue
    const { signature, ...unsigned } = ack
    const valid = await verifyStable(
      unsigned,
      signature,
      base64ToBytes(device.signPub),
    )
    if (!valid) continue
    const previous = result.get(ack.deviceId) ?? -1
    if (ack.streamVersion > previous) {
      result.set(ack.deviceId, ack.streamVersion)
    }
  }
  return result
}
