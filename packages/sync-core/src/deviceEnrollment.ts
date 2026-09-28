import { SYNC_PROTOCOL_VERSION_V2 } from "@myz/shared/versioning"
import type { SyncObjectStore } from "./adapters"
import { randomBytes } from "./crypto"
import { deviceIdFromSignPublicKey, type DeviceKeyPair } from "./deviceKeys"
import {
  addDeviceToRoster,
  type DevicePublicKeys,
  type Roster,
} from "./roster"
import { signStable, verifyStable } from "./signing"
import {
  base32Encode,
  base64ToBytes,
  bytesToBase64,
  decodeBinaryPayload,
  encodeBinaryPayload,
} from "./utils"

export interface DeviceRequest {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION_V2
  accountId: string
  requestId: string
  deviceId: string
  signPub: string
  agreePub: string
  name: string
  createdAt: string
  expiresAt: string
  signature: string
}

export interface DeviceIndex {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION_V2
  accountId: string
  rosterVersion: number
  latestRequestId: string | null
  updatedAt: string
  signedBy: string
  signature: string
}

const DEFAULT_REQUEST_TTL_MS = 24 * 60 * 60 * 1000

export function rosterPath(accountId: string): string {
  return `${accountId}/devices/roster.bin`
}

export function deviceIndexPath(accountId: string): string {
  return `${accountId}/devices/index.bin`
}

export function deviceRequestPath(
  accountId: string,
  requestId: string,
): string {
  return `${accountId}/devices/requests/${requestId}.bin`
}

export async function buildDeviceRequest(options: {
  accountId: string
  device: DeviceKeyPair
  name?: string
  ttlMs?: number
  now?: Date
}): Promise<DeviceRequest> {
  const now = options.now ?? new Date()
  const unsigned = {
    protocolVersion: SYNC_PROTOCOL_VERSION_V2,
    accountId: options.accountId,
    requestId: `req_${base32Encode(randomBytes(12))}`,
    deviceId: await deviceIdFromSignPublicKey(options.device.signPublicKey),
    signPub: bytesToBase64(options.device.signPublicKey),
    agreePub: bytesToBase64(options.device.agreePublicKey),
    name: options.name ?? "",
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + (options.ttlMs ?? DEFAULT_REQUEST_TTL_MS),
    ).toISOString(),
  } satisfies Omit<DeviceRequest, "signature">
  return {
    ...unsigned,
    signature: await signStable(unsigned, options.device.signPrivateKey),
  }
}

export async function verifyDeviceRequest(
  request: DeviceRequest,
  now: number = Date.now(),
): Promise<boolean> {
  if (request.protocolVersion !== SYNC_PROTOCOL_VERSION_V2) return false
  if (Date.parse(request.expiresAt) <= now) return false
  const derivedId = await deviceIdFromSignPublicKey(
    base64ToBytes(request.signPub),
  )
  if (derivedId !== request.deviceId) return false
  const { signature, ...unsigned } = request
  return verifyStable(unsigned, signature, base64ToBytes(request.signPub))
}

export async function buildDeviceIndex(options: {
  roster: Roster
  signer: DeviceKeyPair
  signerDeviceId: string
  latestRequestId: string | null
  now?: string
}): Promise<DeviceIndex> {
  const authorized = options.roster.devices.find(
    (device) =>
      device.deviceId === options.signerDeviceId && !device.revokedAt,
  )
  if (!authorized) {
    throw new Error("Signer is not an authorized device")
  }
  const unsigned = {
    protocolVersion: SYNC_PROTOCOL_VERSION_V2,
    accountId: options.roster.accountId,
    rosterVersion: options.roster.rosterVersion,
    latestRequestId: options.latestRequestId,
    updatedAt: options.now ?? new Date().toISOString(),
    signedBy: options.signerDeviceId,
  } satisfies Omit<DeviceIndex, "signature">
  return {
    ...unsigned,
    signature: await signStable(unsigned, options.signer.signPrivateKey),
  }
}

export async function verifyDeviceIndex(
  index: DeviceIndex,
  roster: Roster,
): Promise<boolean> {
  if (index.protocolVersion !== SYNC_PROTOCOL_VERSION_V2) return false
  if (index.accountId !== roster.accountId) return false
  const signer = roster.devices.find(
    (device) => device.deviceId === index.signedBy && !device.revokedAt,
  )
  if (!signer) return false
  const { signature, ...unsigned } = index
  return verifyStable(unsigned, signature, base64ToBytes(signer.signPub))
}

export async function approveDeviceRequest(options: {
  roster: Roster
  approver: DeviceKeyPair
  approverDeviceId: string
  dataKey: Uint8Array
  request: DeviceRequest
  now?: string
}): Promise<{ roster: Roster; newDeviceId: string }> {
  if (options.request.accountId !== options.roster.accountId) {
    throw new Error("Device request account mismatch")
  }
  if (!(await verifyDeviceRequest(options.request))) {
    throw new Error("Invalid device request")
  }
  const newDevice: DevicePublicKeys = {
    signPublicKey: base64ToBytes(options.request.signPub),
    agreePublicKey: base64ToBytes(options.request.agreePub),
  }
  return addDeviceToRoster({
    roster: options.roster,
    approver: options.approver,
    approverDeviceId: options.approverDeviceId,
    newDevice,
    dataKey: options.dataKey,
    now: options.now,
  })
}

export async function publishRoster(
  store: SyncObjectStore,
  roster: Roster,
  options: { ifMatch?: string } = {},
): Promise<void> {
  await store.putObject(rosterPath(roster.accountId), encodeBinaryPayload(roster), {
    ifMatch: options.ifMatch,
  })
}

export async function loadRoster(
  store: SyncObjectStore,
  accountId: string,
): Promise<Roster | null> {
  const object = await store.getObject(rosterPath(accountId))
  if (!object) return null
  return decodeBinaryPayload(object.body) as Roster
}

export async function publishDeviceIndex(
  store: SyncObjectStore,
  index: DeviceIndex,
  options: { ifMatch?: string } = {},
): Promise<void> {
  await store.putObject(
    deviceIndexPath(index.accountId),
    encodeBinaryPayload(index),
    { ifMatch: options.ifMatch },
  )
}

export async function loadDeviceIndex(
  store: SyncObjectStore,
  accountId: string,
): Promise<DeviceIndex | null> {
  const object = await store.getObject(deviceIndexPath(accountId))
  if (!object) return null
  return decodeBinaryPayload(object.body) as DeviceIndex
}

export async function publishDeviceRequest(
  store: SyncObjectStore,
  request: DeviceRequest,
): Promise<void> {
  await store.putObject(
    deviceRequestPath(request.accountId, request.requestId),
    encodeBinaryPayload(request),
    { ifMatch: undefined, ifNoneMatch: "*" },
  )
}

export async function loadDeviceRequest(
  store: SyncObjectStore,
  accountId: string,
  requestId: string,
): Promise<DeviceRequest | null> {
  const object = await store.getObject(deviceRequestPath(accountId, requestId))
  if (!object) return null
  return decodeBinaryPayload(object.body) as DeviceRequest
}
