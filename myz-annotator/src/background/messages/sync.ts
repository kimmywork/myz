import { isRecord } from "@myz/shared/typeUtils";
import type { SyncS3Settings, SyncSettings } from "../settings";
import { readSettings, writeSettings } from "../storage";
import { S3Client } from "../sync/s3Client";
import { ensureSyncAlarm } from "../sync/scheduler";
import { syncNow } from "../sync/syncEngine";
import { registerMessageHandler } from "./handler";
import { registerAccountHandlers } from "./sync/account.js";
import { registerPairingHandlers } from "./sync/pairing.js";
import type { SyncTestConnectionMessageResult } from "./sync/types.js";
import { changeBus } from "@/messaging/changes";

export type {
  SyncStatusMessageResult,
  AccountStatusMessageResult,
  SyncTestConnectionMessageResult,
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
    async (payload: { s3?: Partial<SyncS3Settings> } | undefined) => {
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

  registerMessageHandler("myz:syncNow", async () => {
    const result = await syncNow();
    if (result.ok) {
      changeBus.publish({ domain: "sync" });
      changeBus.publish({ domain: "records" });
      changeBus.publish({ domain: "inbox" });
    }
    return result;
  });
}
