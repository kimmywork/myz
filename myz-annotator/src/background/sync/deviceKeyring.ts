import {
  deviceIdFromSignPublicKey,
  generateDeviceKeyPair,
  unwrapDeviceKeys,
  wrapDeviceKeys,
  type DeviceKeyPair,
} from "@myz/sync-core/deviceKeys";
import { utf8ToBytes } from "./crypto";
import { getDeviceKey } from "./deviceKey";
import {
  clearDeviceKeyPair,
  readDeviceKeyPair,
  writeDeviceKeyPair,
} from "./storage";
import { bytesToBase64 } from "./utils";

const DEVICE_KEYS_AAD = utf8ToBytes("myz:device-keys:v2");

export interface LocalDevice {
  deviceId: string;
  pair: DeviceKeyPair;
}

/**
 * Load the device's Ed25519/X25519 key pair, generating and persisting it
 * (wrapped by the non-extractable local device key) on first use.
 */
export async function loadOrCreateDeviceKeys(): Promise<LocalDevice> {
  const existing = await readDeviceKeyPair();
  if (existing) {
    const deviceKey = await getDeviceKey();
    const pair = await unwrapDeviceKeys(
      deviceKey,
      { nonce: existing.nonce, cipher: existing.cipher },
      DEVICE_KEYS_AAD,
    );
    return {
      deviceId: await deviceIdFromSignPublicKey(pair.signPublicKey),
      pair,
    };
  }
  const pair = generateDeviceKeyPair();
  const deviceKey = await getDeviceKey();
  const wrapped = await wrapDeviceKeys(deviceKey, pair, DEVICE_KEYS_AAD);
  await writeDeviceKeyPair({
    id: "deviceKeyPair",
    signPub: bytesToBase64(pair.signPublicKey),
    agreePub: bytesToBase64(pair.agreePublicKey),
    nonce: wrapped.nonce,
    cipher: wrapped.cipher,
  });
  return {
    deviceId: await deviceIdFromSignPublicKey(pair.signPublicKey),
    pair,
  };
}

export async function clearDeviceKeys(): Promise<void> {
  await clearDeviceKeyPair();
}
