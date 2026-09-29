import { isRecord } from "@myz/shared/typeUtils";
import type { Roster } from "@myz/sync-core/roster";
import type { SyncS3Settings, SyncSettings } from "../settings";
import { readSettings, writeSettings } from "../storage";
import {
  clearLocalAccount,
  createLocalAccount,
  importLocalAccount,
  loadLocalAccount,
} from "../sync/accountKeyring";
import {
  clearKeyset,
  deriveKeysetFromSecret,
  loadKeyset,
  storeKeyset,
} from "../sync/keyring";
import { buildRotationNotice } from "../sync/rotation";
import { S3Client } from "../sync/s3Client";
import { ensureSyncAlarm } from "../sync/scheduler";
import {
  clearDeletions,
  clearRecordStates,
  clearStreamStates,
  readSyncState,
  writeSyncState,
} from "../sync/storage";
import { syncNow } from "../sync/syncEngine";
import {
  base64ToBytes,
  bytesToBase64,
  decodeBinaryPayload,
  encodeBinaryPayload,
} from "../sync/utils";
import { bootstrapV2Account } from "../sync/v2/bootstrap";
import {
  acceptPairingInvite,
  approvePairing,
  createPairingInvite,
} from "../sync/v2/pairingSession";
import { registerMessageHandler } from "./handler";

export interface SyncStatusMessageResult {
  enabled: boolean;
  keyId: string | null;
  keyUpdatedAt: string | null;
  lastSyncAt: string | null;
  lastManifestVersion: number;
  hasAccount: boolean;
  accountId: string | null;
  deviceId: string | null;
  epoch: number;
}

export interface AccountStatusMessageResult {
  hasAccount: boolean;
  accountId: string | null;
  deviceId: string | null;
  epoch: number;
}

export interface SyncTestConnectionMessageResult {
  ok: boolean;
  message?: string;
}

export interface SyncSetKeyMessageResult {
  keyId: string;
  keyUpdatedAt: string;
}

export interface SyncNowMessageResult {
  ok: boolean;
  status?: string;
  message?: string;
}

export function initializeSyncMessageHandlers() {
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
      const account = await createLocalAccount();
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
      if (!payload?.roster) {
        throw new Error("Missing roster");
      }
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

  registerMessageHandler("myz:pairingInvite", async () => {
    return createPairingInvite();
  });

  registerMessageHandler(
    "myz:pairingAccept",
    async (payload: { invite: string }) => {
      if (!payload?.invite) throw new Error("Missing pairing invite");
      return acceptPairingInvite(payload.invite);
    },
  );

  registerMessageHandler(
    "myz:pairingApprove",
    async (payload: { response: string }) => {
      if (!payload?.response) throw new Error("Missing pairing response");
      return approvePairing(payload.response);
    },
  );

  registerMessageHandler(
    "myz:syncUpdateSettings",
    async (payload: { enabled?: boolean; s3?: Partial<SyncS3Settings> }) => {
      const current = await readSettings();
      const syncPatch: SyncSettings = {
        ...current.sync,
        s3: { ...current.sync.s3 },
      };
      if (typeof payload?.enabled === "boolean") {
        syncPatch.enabled = payload.enabled;
      }
      if (isRecord(payload?.s3)) {
        syncPatch.s3 = { ...syncPatch.s3, ...payload.s3 };
      }
      const updated = await writeSettings({ sync: syncPatch });
      await ensureSyncAlarm();
      if (payload?.enabled) {
        void syncNow();
      }
      return { sync: updated.sync };
    },
  );

  registerMessageHandler(
    "myz:syncTestConnection",
    async (payload: { s3?: Partial<SyncS3Settings> }) => {
      const settings = await readSettings();
      const baseS3 = settings.sync.s3;
      const s3 = isRecord(payload?.s3) ? { ...baseS3, ...payload.s3 } : baseS3;
      if (
        !s3?.endpoint ||
        !s3?.bucket ||
        !s3?.accessKeyId ||
        !s3?.secretAccessKey
      ) {
        throw new Error("缺少 S3 配置");
      }
      const client = new S3Client(s3);
      await client.listObjects(s3.prefix || "");
      return { ok: true } satisfies SyncTestConnectionMessageResult;
    },
  );

  registerMessageHandler(
    "myz:syncSetKey",
    async (payload: { secret: string; userGesture?: boolean }) => {
      if (!payload?.secret) {
        throw new Error("Missing secret");
      }
      const existing = await readSyncState();
      const clientId =
        existing?.clientId ||
        `client_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
      const keyUpdatedAt = new Date().toISOString();
      const previousKeyset = await loadKeyset();
      const settings = await readSettings();
      const baseEpoch = existing?.epoch || 1;
      const keyset = await deriveKeysetFromSecret(payload.secret, baseEpoch);
      const sameKeyId = previousKeyset?.keyId === keyset.keyId;
      const nextEpoch = sameKeyId ? baseEpoch : (existing?.epoch || 0) + 1;
      keyset.epoch = nextEpoch;
      await storeKeyset(keyset);
      if (!sameKeyId) {
        await clearRecordStates();
        await clearDeletions();
      }
      await writeSyncState({
        id: "state",
        clientId,
        epoch: keyset.epoch,
        keyId: keyset.keyId,
        keyUpdatedAt,
        lastManifestVersion: 0,
        lastManifestCreatedAt: null,
        lastSyncAt: null,
      });
      if (
        previousKeyset &&
        !sameKeyId &&
        settings.sync?.enabled &&
        settings.sync.s3?.endpoint &&
        settings.sync.s3?.bucket &&
        settings.sync.s3?.accessKeyId &&
        settings.sync.s3?.secretAccessKey
      ) {
        try {
          const client = new S3Client(settings.sync.s3);
          const notice = await buildRotationNotice(
            previousKeyset.masterKey,
            keyset.keyId,
          );
          await client.putObject(
            `${previousKeyset.keyId}/rotation.notice`,
            notice,
            { metadata: { "updated-at": keyUpdatedAt } },
          );
        } catch (error) {
          console.warn("Failed to write rotation notice", error);
        }
      }
      return {
        keyId: keyset.keyId,
        keyUpdatedAt,
      } satisfies SyncSetKeyMessageResult;
    },
  );

  registerMessageHandler("myz:syncClearKey", async () => {
    await clearKeyset();
    await clearRecordStates();
    await clearDeletions();
    await writeSyncState({
      id: "state",
      clientId: "",
      epoch: 0,
      keyId: null,
      keyUpdatedAt: null,
      lastManifestVersion: 0,
      lastManifestCreatedAt: null,
      lastSyncAt: null,
    });
    return { ok: true } satisfies SyncNowMessageResult;
  });

  registerMessageHandler("myz:syncNow", async () => {
    return syncNow();
  });
}
