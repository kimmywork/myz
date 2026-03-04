import { z } from "zod";
import { MessageSchemaV1 } from "@/background/ai/schemas";
import { AI_SCHEMA_VERSION } from "@/shared/versioning";

export const ConversationInfoSchemaV1 = z.object({
  schemaVersion: z.literal(AI_SCHEMA_VERSION),
  id: z.string(),
  title: z.string(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sendContextEnabled: z.boolean().optional(),
});

export { MessageSchemaV1 };

export type ConversationInfoV1 = z.infer<typeof ConversationInfoSchemaV1>;
