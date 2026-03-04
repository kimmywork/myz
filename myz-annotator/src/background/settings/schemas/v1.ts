import { z } from "zod";
import {
  AI_PROVIDER_TYPES,
  AI_TOOL_CHOICE_MODES,
  AI_TOOL_FLAG_SETTINGS,
  AI_TOOL_SELECTION_MODES,
  MAX_OUTPUT_TOKEN_PARAMS,
} from "../../settings";
import { AUTO_HIGHLIGHT_CATEGORIES, HIGHLIGHT_STYLES } from "@/shared/types";
import { SETTINGS_SCHEMA_VERSION } from "@/shared/versioning";

export const SettingsSchemaVersionV1 = SETTINGS_SCHEMA_VERSION;

const AIAgentModelRefSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
});

const AIToolChoiceSettingSchema = z.object({
  mode: z.enum(AI_TOOL_CHOICE_MODES),
  toolName: z.string().optional(),
});

const AIToolControlSettingsSchema = z.object({
  toolChoice: AIToolChoiceSettingSchema,
  strict: z.enum(AI_TOOL_FLAG_SETTINGS),
  parallelToolCalls: z.enum(AI_TOOL_FLAG_SETTINGS),
});

const AIModelCapabilitiesSchema = z.object({
  vision: z.boolean(),
  imageOutput: z.boolean(),
  toolCalling: z.boolean(),
  reasoning: z.boolean(),
});

const AIModelLimitsSchema = z.object({
  contextWindow: z.number(),
  maxOutputTokens: z.number(),
  maxOutputTokenParam: z.enum(MAX_OUTPUT_TOKEN_PARAMS),
});

const AIModelSettingSchema = z.object({
  id: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  capabilities: AIModelCapabilitiesSchema,
  limits: AIModelLimitsSchema,
  tooling: AIToolControlSettingsSchema,
  systemPromptInUserMessage: z.boolean().optional(),
});

const AIProviderLastTestStatusSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  testedAt: z.string(),
  model: z.string(),
});

const AIProviderSettingSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(AI_PROVIDER_TYPES),
  enabled: z.boolean(),
  streamingEnabled: z.boolean().optional(),
  baseUrl: z.string(),
  apiKey: z.string(),
  headers: z.string(),
  models: z.array(AIModelSettingSchema),
  lastTest: AIProviderLastTestStatusSchema.nullable(),
});

const AIAgentConfigSchema = z.object({
  target: AIAgentModelRefSchema.nullable(),
  temperature: z.number(),
  compressImages: z.boolean().optional(),
  superpowerMode: z.boolean().optional(),
  maxHighlights: z.number().optional(),
  multimodalTarget: AIAgentModelRefSchema.nullable().optional(),
  contextCompressionThreshold: z.number().optional(),
});

const AutoHighlightCategoryStyleSchema = z.object({
  style: z.nativeEnum(HIGHLIGHT_STYLES),
  color: z.string(),
});

const AutoHighlightCategoryStylesSchema = z
  .object({
    [AUTO_HIGHLIGHT_CATEGORIES.CONCEPTUAL]: AutoHighlightCategoryStyleSchema,
    [AUTO_HIGHLIGHT_CATEGORIES.STRUCTURAL]: AutoHighlightCategoryStyleSchema,
    [AUTO_HIGHLIGHT_CATEGORIES.BEHAVIOURAL]: AutoHighlightCategoryStyleSchema,
  })
  .partial();

const AutoHighlightAgentConfigSchema = AIAgentConfigSchema.extend({
  categoryStyles: AutoHighlightCategoryStylesSchema.optional(),
});

const AIAgentsSettingsSchema = z.object({
  conversation: AIAgentConfigSchema,
  insights: AIAgentConfigSchema,
  autoHighlight: AutoHighlightAgentConfigSchema,
});

const AILocalToolsSettingsSchema = z.object({
  enabledToolNames: z.array(z.string()),
  mode: z.enum(AI_TOOL_SELECTION_MODES),
  autoSelectorTarget: AIAgentModelRefSchema.nullable(),
});

const AISkillsSettingsSchema = z.object({
  mode: z.enum(AI_TOOL_SELECTION_MODES),
  autoSelectorTarget: AIAgentModelRefSchema.nullable(),
});

const McpServerSettingSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  lastTest: z
    .object({
      ok: z.boolean(),
      message: z.string(),
      testedAt: z.string(),
    })
    .nullable()
    .optional(),
});

const VectorSearchLastTestStatusSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  testedAt: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  model: z.string(),
});

const VectorSettingsSchema = z.object({
  enabled: z.boolean(),
  target: AIAgentModelRefSchema.nullable(),
  lastTest: VectorSearchLastTestStatusSchema.nullable(),
  matchThreshold: z.number(),
});

const SocialImportProviderSettingsSchema = z.object({
  profileUrl: z.string(),
});

const SocialImportSettingsSchema = z.object({
  twitter: SocialImportProviderSettingsSchema,
  mastodon: SocialImportProviderSettingsSchema,
});

const SyncS3SettingsSchema = z.object({
  endpoint: z.string(),
  region: z.string(),
  bucket: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  sessionToken: z.string().optional(),
  prefix: z.string().optional(),
});

const SyncSettingsSchema = z.object({
  enabled: z.boolean(),
  s3: SyncS3SettingsSchema,
});

export const SettingsSchemaV1 = z.object({
  dashboardView: z.enum(["cards", "list"]),
  colorPalette: z.array(z.string()),
  lastUsedStyle: z.nativeEnum(HIGHLIGHT_STYLES),
  lastUsedColor: z.string(),
  socialImport: SocialImportSettingsSchema,
  sync: SyncSettingsSchema,
  aiAssistantEnabled: z.boolean(),
  aiProviders: z.array(AIProviderSettingSchema),
  aiAgents: AIAgentsSettingsSchema,
  aiMcpServers: z.array(McpServerSettingSchema),
  aiLocalTools: AILocalToolsSettingsSchema,
  aiSkills: AISkillsSettingsSchema,
  vectorSearch: VectorSettingsSchema,
});

export const SettingsBundleSchemaV1 = z.object({
  schemaVersion: z.literal(SETTINGS_SCHEMA_VERSION),
  data: SettingsSchemaV1,
});

export type SettingsV1 = z.infer<typeof SettingsSchemaV1>;
export type SettingsBundleV1 = z.infer<typeof SettingsBundleSchemaV1>;
