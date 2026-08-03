import { isRecord } from "./typeUtils";

export interface SyncS3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  prefix: string;
}

export interface SyncSettings {
  enabled: boolean;
  s3: SyncS3Settings;
}

export const DEFAULT_S3_SETTINGS: SyncS3Settings = {
  endpoint: "",
  region: "",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  sessionToken: "",
  prefix: "",
};

export function normalizeSyncS3Settings(
  value: unknown,
): SyncS3Settings {
  if (!isRecord(value)) {
    return { ...DEFAULT_S3_SETTINGS };
  }
  const s3 = value as Record<string, unknown>;
  return {
    endpoint:
      typeof s3.endpoint === "string" ? s3.endpoint : DEFAULT_S3_SETTINGS.endpoint,
    region:
      typeof s3.region === "string" ? s3.region : DEFAULT_S3_SETTINGS.region,
    bucket:
      typeof s3.bucket === "string" ? s3.bucket : DEFAULT_S3_SETTINGS.bucket,
    accessKeyId:
      typeof s3.accessKeyId === "string"
        ? s3.accessKeyId
        : DEFAULT_S3_SETTINGS.accessKeyId,
    secretAccessKey:
      typeof s3.secretAccessKey === "string"
        ? s3.secretAccessKey
        : DEFAULT_S3_SETTINGS.secretAccessKey,
    sessionToken:
      typeof s3.sessionToken === "string"
        ? s3.sessionToken
        : DEFAULT_S3_SETTINGS.sessionToken,
    prefix:
      typeof s3.prefix === "string" ? s3.prefix : DEFAULT_S3_SETTINGS.prefix,
  };
}

export function normalizeSyncSettings(
  value: unknown,
): SyncSettings {
  if (!isRecord(value)) {
    return { enabled: false, s3: { ...DEFAULT_S3_SETTINGS } };
  }
  const sync = value as Record<string, unknown>;
  return {
    enabled: Boolean(sync.enabled),
    s3: normalizeSyncS3Settings(sync.s3),
  };
}
