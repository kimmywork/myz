export const RECORD_SCHEMA_VERSION = "1.0.0" as const
export const SETTINGS_SCHEMA_VERSION = "1.0.0" as const
export const SYNC_PROTOCOL_VERSION = "1.0.0" as const
export const AI_SCHEMA_VERSION = "1.0.0" as const

/**
 * New device-bound E2EE protocol. This is a clean break: it must never reuse
 * `SYNC_PROTOCOL_VERSION`, so an old client can neither parse nor corrupt it.
 */
export const SYNC_PROTOCOL_VERSION_V2 = "2.0.0" as const

export type RecordSchemaVersion = typeof RECORD_SCHEMA_VERSION
export type SettingsSchemaVersion = typeof SETTINGS_SCHEMA_VERSION
export type SyncProtocolVersion = typeof SYNC_PROTOCOL_VERSION
export type SyncProtocolVersionV2 = typeof SYNC_PROTOCOL_VERSION_V2
export type AiSchemaVersion = typeof AI_SCHEMA_VERSION
