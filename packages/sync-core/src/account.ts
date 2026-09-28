import { deriveMasterKeyFromDataKey, generateAccountId, generateDataKey } from "./dataKey"
import { deviceIdFromSignPublicKey, type DeviceKeyPair } from "./deviceKeys"
import {
  createGenesisRoster,
  unwrapRosterDataKey,
  verifyRoster,
  type Roster,
} from "./roster"
import { signStable, verifyStable } from "./signing"
import { base64ToBytes } from "./utils"

export interface SyncAccount {
  accountId: string
  deviceId: string
  epoch: number
  dataKey: Uint8Array
  masterKey: Uint8Array
  roster: Roster
}

async function buildAccountState(
  device: DeviceKeyPair,
  roster: Roster,
  dataKey: Uint8Array,
): Promise<SyncAccount> {
  return {
    accountId: roster.accountId,
    deviceId: await deviceIdFromSignPublicKey(device.signPublicKey),
    epoch: roster.epoch,
    dataKey,
    masterKey: await deriveMasterKeyFromDataKey(dataKey),
    roster,
  }
}

/**
 * Create a brand-new account on this device: a random accountId, a random D,
 * and a genesis roster (self-signed). This is the clean-break entry point.
 */
export async function createSyncAccount(options: {
  device: DeviceKeyPair
  accountId?: string
  dataKey?: Uint8Array
  now?: string
}): Promise<SyncAccount> {
  const accountId = options.accountId ?? generateAccountId()
  const dataKey = options.dataKey ?? generateDataKey()
  const roster = await createGenesisRoster({
    accountId,
    device: options.device,
    dataKey,
    now: options.now,
  })
  return buildAccountState(options.device, roster, dataKey)
}

/**
 * Join an existing account: verify the roster signature, then unwrap D with the
 * device's X25519 private key. Throws if this device is not authorized (or has
 * been revoked for the current epoch).
 */
export async function openSyncAccount(options: {
  device: DeviceKeyPair
  roster: Roster
}): Promise<SyncAccount> {
  if (!(await verifyRoster(options.roster))) {
    throw new Error("Invalid roster signature")
  }
  const deviceId = await deviceIdFromSignPublicKey(options.device.signPublicKey)
  const dataKey = await unwrapRosterDataKey(
    options.roster,
    deviceId,
    options.device.agreePrivateKey,
  )
  return buildAccountState(options.device, options.roster, dataKey)
}

/** Sign a manifest/payload on behalf of this device. */
export async function signAccountPayload(
  payload: object,
  device: DeviceKeyPair,
): Promise<string> {
  return signStable(payload, device.signPrivateKey)
}

/** Verify a manifest/payload signature against an authorized roster device. */
export async function verifyAccountPayload(
  payload: object,
  signature: string,
  signedBy: string,
  roster: Roster,
): Promise<boolean> {
  const device = roster.devices.find(
    (entry) => entry.deviceId === signedBy && !entry.revokedAt,
  )
  if (!device) return false
  return verifyStable(payload, signature, base64ToBytes(device.signPub))
}
