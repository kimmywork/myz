import { z } from "zod";
import { AI_SCHEMA_VERSION } from "@/shared/versioning";

export const AiSchemaVersionV1 = AI_SCHEMA_VERSION;

export const ToolCallSchemaV1 = z
  .object({
    id: z.string(),
    index: z.number().optional(),
    type: z.literal("function"),
    thought_signature: z.string().optional(),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })
  .passthrough();

export const MessageSchemaV1 = z.object({
  schemaVersion: z.literal(AI_SCHEMA_VERSION),
  id: z.string(),
  conversationId: z.string().nullable().optional(),
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string(),
  timestamp: z.string(),
  reasoning_content: z.string().optional(),
  tool_calls: z.array(ToolCallSchemaV1).optional(),
  tool_call_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ConversationSchemaV1 = z.object({
  schemaVersion: z.literal(AI_SCHEMA_VERSION),
  conversationId: z.string(),
  title: z.string(),
  url: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  sendContextEnabled: z.boolean().optional(),
  messages: z.array(MessageSchemaV1),
});

export type ToolCallV1 = z.infer<typeof ToolCallSchemaV1>;
export type MessageV1 = z.infer<typeof MessageSchemaV1>;
export type ConversationV1 = z.infer<typeof ConversationSchemaV1>;
