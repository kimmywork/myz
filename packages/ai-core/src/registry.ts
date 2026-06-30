import { createSchemaRegistry } from "@myz/shared/schemaRegistry"
import { AI_SCHEMA_VERSION } from "@myz/shared/versioning"
import {
  MessageSchemaV1,
  ConversationSchemaV1,
  ToolCallSchemaV1,
} from "./schemas"

export const AiMessageRegistry = createSchemaRegistry({
  latestVersion: AI_SCHEMA_VERSION,
  versions: {
    [AI_SCHEMA_VERSION]: MessageSchemaV1,
  },
})

export const AiConversationRegistry = createSchemaRegistry({
  latestVersion: AI_SCHEMA_VERSION,
  versions: {
    [AI_SCHEMA_VERSION]: ConversationSchemaV1,
  },
})

export const AiToolCallRegistry = createSchemaRegistry({
  latestVersion: AI_SCHEMA_VERSION,
  versions: {
    [AI_SCHEMA_VERSION]: ToolCallSchemaV1,
  },
})
