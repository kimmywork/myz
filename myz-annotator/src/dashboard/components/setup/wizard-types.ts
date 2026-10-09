/** Shared types and step labels for the sync setup wizard. */
export type Scenario = "create" | "join" | "authorize";
export type Phase = "select" | "run";
export type Tone = "info" | "error" | "success" | "warn";
export type SyncState = "idle" | "running" | "done" | "failed" | "later";

export interface SyncStatusResult {
  hasAccount: boolean;
  accountId: string | null;
  deviceId: string | null;
  epoch: number;
  keyId: string | null;
  lastSyncAt: string | null;
}

export interface PairingS3Prefill {
  endpoint: string;
  region: string;
  bucket: string;
  prefix?: string;
}

export const CREATE_STEPS = [
  "S3 存储",
  "迁移旧数据",
  "创建账号",
  "首次同步",
  "完成",
];
export const JOIN_STEPS = [
  "S3 存储",
  "获取邀请",
  "核对短码",
  "完成加入",
  "首次同步",
];
export const AUTHORIZE_STEPS = ["生成邀请", "新设备响应", "核对并批准"];
export const AUTHORIZE_STEPS_WITH_S3 = ["S3 存储", ...AUTHORIZE_STEPS];
