import {
  createSyncAccount,
  openSyncAccount,
  type SyncAccount,
} from "@myz/sync-core/account";
import type { Roster } from "@myz/sync-core/roster";
import { loadOrCreateDeviceKeys } from "./deviceKeyring";
import {
  clearAccountRecord,
  readAccountRecord,
  writeAccountRecord,
} from "./storage";
import {
  base64ToBytes,
  bytesToBase64,
  decodeBinaryPayload,
  encodeBinaryPayload,
} from "./utils";

async function persistAccount(account: SyncAccount): Promise<void> {
  await writeAccountRecord({
    id: "account",
    accountId: account.accountId,
    epoch: account.epoch,
    roster: bytesToBase64(encodeBinaryPayload(account.roster)),
  });
}

async function openRosterAccount(roster: Roster): Promise<SyncAccount> {
  const { pair } = await loadOrCreateDeviceKeys();
  const account = await openSyncAccount({ device: pair, roster });
  await persistAccount(account);
  return account;
}

/** Create a new v2 account on this device (clean break). */
export async function createLocalAccount(): Promise<SyncAccount> {
  const { pair } = await loadOrCreateDeviceKeys();
  const account = await createSyncAccount({ device: pair });
  await persistAccount(account);
  return account;
}

/** Load and open the persisted account (unwrapping D from the roster). */
export async function loadLocalAccount(): Promise<SyncAccount | null> {
  const record = await readAccountRecord();
  if (!record) return null;
  const roster = decodeBinaryPayload(base64ToBytes(record.roster)) as Roster;
  const { pair } = await loadOrCreateDeviceKeys();
  return openSyncAccount({ device: pair, roster });
}

/** Join an existing account from a roster fetched/passed out-of-band. */
export async function importLocalAccount(roster: Roster): Promise<SyncAccount> {
  return openRosterAccount(roster);
}

export async function clearLocalAccount(): Promise<void> {
  await clearAccountRecord();
}
