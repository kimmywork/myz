import {
  MessageSchemaV1,
  ConversationSchemaV1,
  ToolCallSchemaV1,
} from "./schemas";
import { createSchemaRegistry } from "@/shared/schemaRegistry";
import { AI_SCHEMA_VERSION } from "@/shared/versioning";

export const AiMessageRegistry = createSchemaRegistry({
  latestVersion: AI_SCHEMA_VERSION,
  versions: {
    [AI_SCHEMA_VERSION]: MessageSchemaV1,
  },
});

export const AiConversationRegistry = createSchemaRegistry({
  latestVersion: AI_SCHEMA_VERSION,
  versions: {
    [AI_SCHEMA_VERSION]: ConversationSchemaV1,
  },
});

export const AiToolCallRegistry = createSchemaRegistry({
  latestVersion: AI_SCHEMA_VERSION,
  versions: {
    [AI_SCHEMA_VERSION]: ToolCallSchemaV1,
  },
});
