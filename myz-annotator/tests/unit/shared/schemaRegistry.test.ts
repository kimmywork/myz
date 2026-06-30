import { describe, it, expect } from "vitest";
import {
  AiMessageRegistry,
  AiConversationRegistry,
  AiToolCallRegistry,
} from "@/background/ai/registry";
import { DEFAULT_SETTINGS } from "@/background/constants";
import {
  SettingsRegistry,
  SettingsBundleRegistry,
} from "@/background/settings/registry";
import {
  SyncRecordPayloadRegistry,
  SyncManifestRegistry,
  SyncChunkEnvelopeRegistry,
  SyncLockPayloadRegistry,
} from "@/background/sync/registry";
import { MyZRecordRegistry } from "@/shared/recordRegistry";
import {
  RECORD_SCHEMA_VERSION,
  SETTINGS_SCHEMA_VERSION,
  SYNC_PROTOCOL_VERSION,
  AI_SCHEMA_VERSION,
} from "@/shared/versioning";

describe("schema registry mapping", () => {
  it("should map record schema by version", () => {
    expect(MyZRecordRegistry.latestVersion).toBe(RECORD_SCHEMA_VERSION);
    const schema = MyZRecordRegistry.versions[RECORD_SCHEMA_VERSION];
    expect(schema).toBeDefined();
    const result = schema.safeParse({
      schemaVersion: RECORD_SCHEMA_VERSION,
      id: "1",
      kind: "highlight",
      text: "",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
  });

  it("should map settings schemas by version", () => {
    expect(SettingsRegistry.latestVersion).toBe(SETTINGS_SCHEMA_VERSION);
    const settingsSchema = SettingsRegistry.versions[SETTINGS_SCHEMA_VERSION];
    expect(settingsSchema).toBeDefined();
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);

    expect(SettingsBundleRegistry.latestVersion).toBe(SETTINGS_SCHEMA_VERSION);
    const bundleSchema =
      SettingsBundleRegistry.versions[SETTINGS_SCHEMA_VERSION];
    expect(bundleSchema).toBeDefined();
    const bundleResult = bundleSchema.safeParse({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      data: DEFAULT_SETTINGS,
    });
    expect(bundleResult.success).toBe(true);
  });

  it("should map sync schemas by version", () => {
    expect(SyncRecordPayloadRegistry.latestVersion).toBe(SYNC_PROTOCOL_VERSION);
    const payloadSchema =
      SyncRecordPayloadRegistry.versions[SYNC_PROTOCOL_VERSION];
    expect(payloadSchema).toBeDefined();
    expect(
      payloadSchema.safeParse({
        protocolVersion: SYNC_PROTOCOL_VERSION,
        recordId: "r1",
        type: "highlight",
        updatedAt: "2024-01-01T00:00:00.000Z",
        data: {},
      }).success,
    ).toBe(true);

    expect(SyncManifestRegistry.latestVersion).toBe(SYNC_PROTOCOL_VERSION);
    const manifestSchema = SyncManifestRegistry.versions[SYNC_PROTOCOL_VERSION];
    expect(manifestSchema).toBeDefined();
    expect(
      manifestSchema.safeParse({
        protocolVersion: SYNC_PROTOCOL_VERSION,
        version: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        clientId: "client-1",
        baseVersion: 0,
        epoch: 1,
        recordsIndex: {},
        chunksIndex: {},
        chainHeads: {},
      }).success,
    ).toBe(true);

    expect(SyncChunkEnvelopeRegistry.latestVersion).toBe(SYNC_PROTOCOL_VERSION);
    const chunkSchema =
      SyncChunkEnvelopeRegistry.versions[SYNC_PROTOCOL_VERSION];
    expect(chunkSchema).toBeDefined();
    expect(
      chunkSchema.safeParse({
        protocolVersion: SYNC_PROTOCOL_VERSION,
        recordId: "r1",
        updatedAt: "2024-01-01T00:00:00.000Z",
        prevHash: "prev",
        keyId: "key-1",
        recordCipher: "cipher",
        recordNonce: "nonce",
      }).success,
    ).toBe(true);

    const lockSchema = SyncLockPayloadRegistry.versions[SYNC_PROTOCOL_VERSION];
    expect(lockSchema).toBeDefined();
    expect(
      lockSchema.safeParse({
        clientId: "client-1",
        leaseExpiresAt: "2024-01-01T00:00:00.000Z",
        issuedAt: "2024-01-01T00:00:00.000Z",
        signature: "sig",
      }).success,
    ).toBe(true);
  });

  it("should map ai schemas by version", () => {
    expect(AiMessageRegistry.latestVersion).toBe(AI_SCHEMA_VERSION);
    const messageSchema = AiMessageRegistry.versions[AI_SCHEMA_VERSION];
    expect(messageSchema).toBeDefined();
    const message = {
      schemaVersion: AI_SCHEMA_VERSION,
      id: "m1",
      conversationId: "c1",
      role: "user",
      content: "hello",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    expect(messageSchema.safeParse(message).success).toBe(true);

    expect(AiConversationRegistry.latestVersion).toBe(AI_SCHEMA_VERSION);
    const conversationSchema =
      AiConversationRegistry.versions[AI_SCHEMA_VERSION];
    expect(conversationSchema).toBeDefined();
    expect(
      conversationSchema.safeParse({
        schemaVersion: AI_SCHEMA_VERSION,
        conversationId: "c1",
        title: "Title",
        url: "https://example.com",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        sendContextEnabled: false,
        messages: [message],
      }).success,
    ).toBe(true);

    expect(AiToolCallRegistry.latestVersion).toBe(AI_SCHEMA_VERSION);
    const toolSchema = AiToolCallRegistry.versions[AI_SCHEMA_VERSION];
    expect(toolSchema).toBeDefined();
    expect(
      toolSchema.safeParse({
        id: "t1",
        type: "function",
        function: { name: "TestTool", arguments: "{}" },
      }).success,
    ).toBe(true);
  });
});
