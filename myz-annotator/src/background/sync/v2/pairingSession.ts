import {
  acceptPairingOffer,
  completePairing,
  createPairingOffer,
  type PairingOffer,
  type PairingResponse,
} from "@myz/sync-core/pairing";
import { addDeviceToRoster } from "@myz/sync-core/roster";
import { loadLocalAccount } from "../accountKeyring";
import { loadOrCreateDeviceKeys } from "../deviceKeyring";
import { writeAccountRecord } from "../storage";
import {
  base64ToBytes,
  bytesToBase64,
  decodeBinaryPayload,
  encodeBinaryPayload,
} from "../utils";

const PENDING_KEY = "myz::pairing_pending";
const PENDING_TTL_MS = 10 * 60 * 1000;

interface PendingPairing {
  offer: PairingOffer;
  secret: string;
  createdAt: number;
}

export function encodePairing(value: unknown): string {
  return bytesToBase64(encodeBinaryPayload(value));
}

export function decodePairing<T>(text: string): T {
  return decodeBinaryPayload(base64ToBytes(text.trim())) as T;
}

async function savePending(value: PendingPairing): Promise<void> {
  await chrome.storage.local.set({ [PENDING_KEY]: value });
}

async function clearPending(): Promise<void> {
  await chrome.storage.local.remove(PENDING_KEY);
}

async function readPending(): Promise<PendingPairing | null> {
  const { [PENDING_KEY]: value } = (await chrome.storage.local.get(
    PENDING_KEY,
  )) as { [PENDING_KEY]?: PendingPairing };
  if (!value) return null;
  if (Date.now() - value.createdAt > PENDING_TTL_MS) {
    await clearPending();
    return null;
  }
  return value;
}

/** Step 1 (host): produce an invite string to hand to the new device. */
export async function createPairingInvite(): Promise<{ offer: string }> {
  const account = await loadLocalAccount();
  if (!account) throw new Error("本机还没有同步账号，请先创建或迁移");
  const { pair } = await loadOrCreateDeviceKeys();
  const { offer, secret } = await createPairingOffer({
    accountId: account.accountId,
    host: pair,
  });
  await savePending({
    offer,
    secret: bytesToBase64(secret),
    createdAt: Date.now(),
  });
  return { offer: encodePairing(offer) };
}

/** Step 2 (new device): accept the invite and show the SAS to compare. */
export async function acceptPairingInvite(
  invite: string,
): Promise<{ response: string; sas: string }> {
  const offer = decodePairing<PairingOffer>(invite);
  const { pair } = await loadOrCreateDeviceKeys();
  const { response, sas } = await acceptPairingOffer({ offer, device: pair });
  return { response: encodePairing(response), sas };
}

/**
 * Step 3 (host): verify the response, add the device (wrap D for it), and
 * return the host-side SAS (must equal the new device's) plus the updated
 * pairing string to send back.
 */
export async function approvePairing(
  responseText: string,
): Promise<{ sas: string; roster: string }> {
  const pending = await readPending();
  if (!pending) {
    throw new Error("没有待处理的配对邀请（可能已过期），请重新生成");
  }
  const response = decodePairing<PairingResponse>(responseText);
  const completed = await completePairing({
    offer: pending.offer,
    secret: base64ToBytes(pending.secret),
    response,
  });
  const account = await loadLocalAccount();
  if (!account) throw new Error("本机还没有同步账号");
  const { pair } = await loadOrCreateDeviceKeys();
  const { roster } = await addDeviceToRoster({
    roster: account.roster,
    approver: pair,
    approverDeviceId: account.deviceId,
    newDevice: completed.device,
    dataKey: account.dataKey,
  });
  await writeAccountRecord({
    id: "account",
    accountId: roster.accountId,
    epoch: roster.epoch,
    roster: bytesToBase64(encodeBinaryPayload(roster)),
  });
  await clearPending();
  return { sas: completed.sas, roster: encodePairing(roster) };
}
