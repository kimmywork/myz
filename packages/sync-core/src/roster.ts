import { SYNC_PROTOCOL_VERSION_V2 } from "@myz/shared/versioning"
import {
  deviceIdFromSignPublicKey,
  unwrapDataKeyForDevice,
  wrapDataKeyForDevice,
  type DeviceKeyPair,
} from "./deviceKeys"
import { signStable, verifyStable } from "./signing"
import { base64ToBytes, bytesToBase64 } from "./utils"

export interface RosterDevice {
  deviceId: string
  signPub: string
  agreePub: string
  addedAt: string
  addedBy: string | null
  revokedAt?: string | null
}

export interface RosterWrappedDataKey {
  deviceId: string
  epoch: number
  ephPub: string
  nonce: string
  cipher: string
}

export interface Roster {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION_V2
  accountId: string
  rosterVersion: number
  epoch: number
  createdAt: string
  devices: RosterDevice[]
  wrappedD: RosterWrappedDataKey[]
  signedBy: string
  signature: string
}

type UnsignedRoster = Omit<Roster, "signature">

/** The public half of a device, enough to add it to a roster and wrap D. */
export interface DevicePublicKeys {
  signPublicKey: Uint8Array
  agreePublicKey: Uint8Array
}

function toDeviceEntry(
  deviceId: string,
  pair: DevicePublicKeys,
  now: string,
  addedBy: string | null,
): RosterDevice {
  return {
    deviceId,
    signPub: bytesToBase64(pair.signPublicKey),
    agreePub: bytesToBase64(pair.agreePublicKey),
    addedAt: now,
    addedBy,
    revokedAt: null,
  }
}

export async function createGenesisRoster(options: {
  accountId: string
  device: DeviceKeyPair
  dataKey: Uint8Array
  epoch?: number
  now?: string
}): Promise<Roster> {
  const epoch = options.epoch ?? 1
  const now = options.now ?? new Date().toISOString()
  const deviceId = await deviceIdFromSignPublicKey(options.device.signPublicKey)
  const wrapped = await wrapDataKeyForDevice(
    options.dataKey,
    options.device.agreePublicKey,
    epoch,
  )
  const unsigned: UnsignedRoster = {
    protocolVersion: SYNC_PROTOCOL_VERSION_V2,
    accountId: options.accountId,
    rosterVersion: 1,
    epoch,
    createdAt: now,
    devices: [toDeviceEntry(deviceId, options.device, now, null)],
    wrappedD: [{ deviceId, epoch, ...wrapped }],
    signedBy: deviceId,
  }
  return {
    ...unsigned,
    signature: await signStable(unsigned, options.device.signPrivateKey),
  }
}

async function assertApprover(
  roster: Roster,
  approverDeviceId: string,
): Promise<void> {
  if (!(await verifyRoster(roster))) {
    throw new Error("Invalid roster signature")
  }
  const approver = roster.devices.find(
    (device) => device.deviceId === approverDeviceId,
  )
  if (!approver || approver.revokedAt) {
    throw new Error("Approver is not an authorized device")
  }
}

export async function addDeviceToRoster(options: {
  roster: Roster
  approver: DeviceKeyPair
  approverDeviceId: string
  newDevice: DevicePublicKeys
  dataKey: Uint8Array
  now?: string
}): Promise<{ roster: Roster; newDeviceId: string }> {
  await assertApprover(options.roster, options.approverDeviceId)
  const now = options.now ?? new Date().toISOString()
  const newDeviceId = await deviceIdFromSignPublicKey(
    options.newDevice.signPublicKey,
  )
  if (options.roster.devices.some((d) => d.deviceId === newDeviceId)) {
    throw new Error("Device is already in the roster")
  }
  const wrapped = await wrapDataKeyForDevice(
    options.dataKey,
    options.newDevice.agreePublicKey,
    options.roster.epoch,
  )
  const unsigned: UnsignedRoster = {
    ...withoutSignature(options.roster),
    rosterVersion: options.roster.rosterVersion + 1,
    devices: [
      ...options.roster.devices,
      toDeviceEntry(newDeviceId, options.newDevice, now, options.approverDeviceId),
    ],
    wrappedD: [
      ...options.roster.wrappedD,
      { deviceId: newDeviceId, epoch: options.roster.epoch, ...wrapped },
    ],
    signedBy: options.approverDeviceId,
  }
  return {
    roster: {
      ...unsigned,
      signature: await signStable(unsigned, options.approver.signPrivateKey),
    },
    newDeviceId,
  }
}

/**
 * Revoke a device and rotate to a new epoch: a new data key is wrapped only to
 * the remaining devices, so the removed device cannot read future data.
 */
export async function revokeDeviceAndRotate(options: {
  roster: Roster
  approver: DeviceKeyPair
  approverDeviceId: string
  revokeDeviceId: string
  newDataKey: Uint8Array
  now?: string
}): Promise<Roster> {
  await assertApprover(options.roster, options.approverDeviceId)
  const now = options.now ?? new Date().toISOString()
  const nextEpoch = options.roster.epoch + 1
  const devices = options.roster.devices.map((device) =>
    device.deviceId === options.revokeDeviceId
      ? { ...device, revokedAt: now }
      : device,
  )
  const active = devices.filter((device) => !device.revokedAt)
  const wrappedD: RosterWrappedDataKey[] = []
  for (const device of active) {
    const wrapped = await wrapDataKeyForDevice(
      options.newDataKey,
      base64ToBytes(device.agreePub),
      nextEpoch,
    )
    wrappedD.push({ deviceId: device.deviceId, epoch: nextEpoch, ...wrapped })
  }
  const unsigned: UnsignedRoster = {
    ...withoutSignature(options.roster),
    rosterVersion: options.roster.rosterVersion + 1,
    epoch: nextEpoch,
    devices,
    wrappedD,
    signedBy: options.approverDeviceId,
  }
  return {
    ...unsigned,
    signature: await signStable(unsigned, options.approver.signPrivateKey),
  }
}

export async function verifyRoster(roster: Roster): Promise<boolean> {
  const signer = roster.devices.find(
    (device) => device.deviceId === roster.signedBy,
  )
  if (!signer || signer.revokedAt) return false
  return verifyStable(
    withoutSignature(roster),
    roster.signature,
    base64ToBytes(signer.signPub),
  )
}

export async function unwrapRosterDataKey(
  roster: Roster,
  deviceId: string,
  agreePrivateKey: Uint8Array,
): Promise<Uint8Array> {
  const entry = roster.wrappedD.find(
    (wrapped) => wrapped.deviceId === deviceId && wrapped.epoch === roster.epoch,
  )
  if (!entry) {
    throw new Error("No wrapped data key for this device at the current epoch")
  }
  return unwrapDataKeyForDevice(entry, agreePrivateKey, entry.epoch)
}

export function assertRosterAdvance(
  previous: Roster | null,
  next: Roster,
): void {
  if (!previous) return
  if (next.accountId !== previous.accountId) {
    throw new Error("Roster account id mismatch")
  }
  if (next.rosterVersion <= previous.rosterVersion) {
    throw new Error("Rejected stale roster version")
  }
}

function withoutSignature(roster: Roster): UnsignedRoster {
  const { signature: _signature, ...unsigned } = roster
  return unsigned
}
