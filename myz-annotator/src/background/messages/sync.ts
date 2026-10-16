import { isRecord } from "@myz/shared/typeUtils";
import type { SyncS3Settings, SyncSettings } from "../settings";
import { readSettings, writeSettings } from "../storage";
import { loadLocalAccount } from "../sync/accountKeyring";
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
  readSyncState,
  writeSyncState,
} from "../sync/storage";
import { syncNow } from "../sync/syncEngine";
import { cleanupLegacy } from "../sync/v2/bootstrap";
import { registerMessageHandler } from "./handler";
import { registerAccountHandlers } from "./sync/account.js";
import { registerPairingHandlers } from "./sync/pairing.js";
import type {
  SyncNowMessageResult,
  SyncSetKeyMessageResult,
  SyncTestConnectionMessageResult,
} from "./sync/types.js";
import { changeBus } from "@/messaging/changes";

export type {
  SyncStatusMessageResult,
  AccountStatusMessageResult,
  SyncTestConnectionMessageResult,
  SyncSetKeyMessageResult,
  SyncNowMessageResult,
} from "./sync/types.js";

export function initializeSyncMessageHandlers() {
  registerAccountHandlers();
  registerPairingHandlers();

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
      if (payload?.enabled) void syncNow();
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
      if (!payload?.secret) throw new Error("Missing secret");
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
    const result = await syncNow();
    if (result?.ok) {
      changeBus.publish({ domain: "sync" });
      changeBus.publish({ domain: "records" });
      changeBus.publish({ domain: "inbox" });
    }
    // Once a v2 account is in place, a successful sync means the legacy keyset
    // (if any) is no longer needed; purge it only after success so an
    // interrupted first run can still be resumed.
    if (result?.ok) {
      try {
        const account = await loadLocalAccount();
        if (account && (await loadKeyset())) await cleanupLegacy();
      } catch (error) {
        console.warn("Failed to purge legacy keyset after sync", error);
      }
    }
    return result;
  });
}
