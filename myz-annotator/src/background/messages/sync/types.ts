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
