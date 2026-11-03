/**
 * Settings for the 解读 hand-off (toolbar → external AI chat).
 *
 * Stored inside the main settings bundle as `settings.ai`. Normalization is
 * lenient — a missing or partial value resolves to defaults — so older stored
 * bundles keep working without a schema migration.
 */
import { z } from "zod";
import {
  DEFAULT_AI_PROMPT_TEMPLATE,
  normalizePromptTemplate,
} from "./prompt.js";
import { AI_PROVIDER_IDS, getAiProvider, isAiProviderId } from "./providers.js";
import type { AiProviderId } from "./providers.js";

export interface AiSettings {
  /** Show the 解读 button in the web capture toolbar. */
  enabled: boolean;
  /** Which chat site the toolbar hands the selection off to. */
  provider: AiProviderId;
  /** Template with `{TEXT}` / `{URL}` placeholders. */
  promptTemplate: string;
}

/** Runtime contract for stored AI settings (drift detection in the bundle). */
export const AiSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(AI_PROVIDER_IDS as [AiProviderId, ...AiProviderId[]]),
  promptTemplate: z.string().max(2000),
});

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: "deepseek",
  promptTemplate: DEFAULT_AI_PROMPT_TEMPLATE,
};

/** Coerce anything stored/patched into a complete {@link AiSettings}. */
export function normalizeAiSettings(value: unknown): AiSettings {
  const record = (value ?? {}) as Partial<AiSettings>;
  return {
    // Opt-in: the hand-off sends page content to a third party, so it stays off
    // until the user explicitly enables it in settings.
    enabled: record.enabled === true,
    provider: isAiProviderId(record.provider)
      ? record.provider
      : DEFAULT_AI_SETTINGS.provider,
    promptTemplate: normalizePromptTemplate(record.promptTemplate),
  };
}

/** The subset of AI settings content scripts may know about. */
export interface PublicAiSettings {
  enabled: boolean;
  provider: AiProviderId;
  /** Provider name for the toolbar label ("使用 DeepSeek 解读"). */
  providerLabel: string;
}

export function pickPublicAiSettings(value: unknown): PublicAiSettings {
  const ai = normalizeAiSettings(value);
  return {
    enabled: ai.enabled,
    provider: ai.provider,
    providerLabel: getAiProvider(ai.provider).label,
  };
}
