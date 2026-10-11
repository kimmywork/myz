import type { Roster } from "@myz/sync-core/roster";
import type { SyncS3Settings } from "../../settings";
import { readSettings } from "../../storage";
import {
  clearLocalAccount,
  createLocalAccount,
  importLocalAccount,
  loadLocalAccount,
} from "../../sync/accountKeyring";
import { loadKeyset } from "../../sync/keyring";
import { clearStreamStates, readSyncState } from "../../sync/storage";
import {
  base64ToBytes,
  bytesToBase64,
  decodeBinaryPayload,
  encodeBinaryPayload,
} from "../../sync/utils";
import {
  bootstrapV2Account,
  migrateLegacyRemote,
} from "../../sync/v2/bootstrap";
import { registerMessageHandler } from "../handler";
import type {
  AccountStatusMessageResult,
  SyncNowMessageResult,
  SyncStatusMessageResult,
} from "./types.js";

/** Sync/account status + create/import/clear/migrate/bootstrap handlers. */
export function registerAccountHandlers() {
  registerMessageHandler("myz:syncStatus", async () => {
    const settings = await readSettings();
    const state = await readSyncState();
    const keyset = await loadKeyset();
    const account = await loadLocalAccount();
    const result: SyncStatusMessageResult = {
      enabled: Boolean(settings.sync?.enabled),
      keyId: keyset?.keyId || null,
      keyUpdatedAt: state?.keyUpdatedAt || null,
      lastSyncAt: state?.lastSyncAt || null,
      lastManifestVersion: state?.lastManifestVersion || 0,
      hasAccount: Boolean(account),
      accountId: account?.accountId || null,
      deviceId: account?.deviceId || null,
      epoch: account?.epoch || 0,
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
    "myz:accountMigrateLegacy",
    async (payload: {
      secret?: string;
      s3?: Partial<SyncS3Settings>;
      userGesture?: boolean;
    }) => migrateLegacyRemote({ secret: payload?.secret, s3: payload?.s3 }),
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
    return { ok: true } satisfies SyncNowMessageResult;
  });

  registerMessageHandler(
    "myz:accountBootstrap",
    async (payload: { rescue?: boolean; userGesture?: boolean }) => {
      void payload;
      return bootstrapV2Account({ rescue: payload?.rescue !== false });
    },
  );
}
