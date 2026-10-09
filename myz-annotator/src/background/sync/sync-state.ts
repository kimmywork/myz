import {
  clearDeletions,
  clearRecordStates,
  readSyncState,
  writeSyncState,
} from "./storage";

export async function ensureSyncState(keyId: string, epoch: number) {
  const state = await readSyncState();
  if (state && state.clientId) return state;
  const clientId =
    state?.clientId ||
    `client_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  const next = {
    id: "state" as const,
    clientId,
    epoch,
    keyId,
    keyUpdatedAt: new Date().toISOString(),
    lastManifestVersion: 0,
    lastManifestCreatedAt: null,
    lastSyncAt: null,
  };
  await writeSyncState(next);
  return next;
}

export async function purgeLocalSyncState() {
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
}

export async function notifyRemoteChanges(count: number) {
  if (!count) return;
  try {
    await chrome.notifications.create(`myz-sync-${Date.now()}`, {
      type: "basic",
      iconUrl: "assets/icon-128.png",
      title: "同步完成",
      message: `同步到了 ${count} 条新的记录`,
    });
  } catch (error) {
    console.warn("Failed to send sync notification", error);
  }
}
