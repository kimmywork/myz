import type { Roster } from "@myz/sync-core/roster";
import { readSettings } from "../../storage";
import {
  clearLocalAccount,
  createLocalAccount,
  importLocalAccount,
  loadLocalAccount,
} from "../../sync/accountKeyring";
import { clearStreamStates, readSyncState } from "../../sync/storage";
import {
  base64ToBytes,
  bytesToBase64,
  decodeBinaryPayload,
  encodeBinaryPayload,
} from "../../sync/utils";
import { bootstrapV2Account } from "../../sync/v2/bootstrap";
import { registerMessageHandler } from "../handler";
import type {
  AccountStatusMessageResult,
  SyncStatusMessageResult,
} from "./types.js";

/** Sync/account status + create/import/clear/bootstrap handlers. */
export function registerAccountHandlers() {
  registerMessageHandler("myz:syncStatus", async () => {
    const settings = await readSettings();
    const state = await readSyncState();
    const account = await loadLocalAccount();
    const result: SyncStatusMessageResult = {
      enabled: Boolean(settings.sync?.enabled),
      lastSyncAt: state?.lastSyncAt ?? null,
      lastManifestVersion: state?.lastManifestVersion ?? 0,
      hasAccount: Boolean(account),
      accountId: account?.accountId ?? null,
      deviceId: account?.deviceId ?? null,
      epoch: account?.epoch ?? 0,
    };
    return result;
  });

  registerMessageHandler("myz:accountStatus", async () => {
    const account = await loadLocalAccount();
    const result: AccountStatusMessageResult = {
      hasAccount: Boolean(account),
      accountId: account?.accountId || null,
      deviceId: account?.deviceId || null,
      epoch: account?.epoch || 0,
    };
    return result;
  });

  registerMessageHandler(
    "myz:accountCreate",
    async (payload: { userGesture?: boolean }) => {
      void payload;
      // Idempotent: the wizard can re-run this step without rotating the
      // account if a previous run was interrupted after creation.
      const account =
        (await loadLocalAccount()) ?? (await createLocalAccount());
      return {
        accountId: account.accountId,
        deviceId: account.deviceId,
        epoch: account.epoch,
        roster: bytesToBase64(encodeBinaryPayload(account.roster)),
      };
    },
  );

  registerMessageHandler(
    "myz:accountImport",
    async (payload: { roster: string; userGesture?: boolean }) => {
      if (!payload?.roster) throw new Error("Missing roster");
      const roster = decodeBinaryPayload(
        base64ToBytes(payload.roster),
      ) as Roster;
      const account = await importLocalAccount(roster);
      return {
        accountId: account.accountId,
        deviceId: account.deviceId,
        epoch: account.epoch,
      };
    },
  );

  registerMessageHandler("myz:accountClear", async () => {
    await clearLocalAccount();
    await clearStreamStates();
    return { ok: true };
  });

  registerMessageHandler(
    "myz:accountBootstrap",
    async (payload: { userGesture?: boolean }) => {
      void payload;
      return bootstrapV2Account();
    },
  );
}
