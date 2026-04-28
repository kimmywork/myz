import type {
  AIProviderType,
  OpenAICompatibleProfile,
} from "@/background/settings.js";

export interface ProviderTypeMeta {
  type: AIProviderType;
  label: string;
  defaultName: string;
  baseUrlPlaceholder: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
  tier: "tier_0" | "tier_1" | "tier_2";
  routeNote: string;
}

export interface OpenAICompatibleProfileMeta {
  value: OpenAICompatibleProfile;
  label: string;
  tier: "tier_1" | "tier_2";
  supportsReasoningMode: boolean;
  supportsReasoningEffort: boolean;
  supportsReasoningBudget: boolean;
  supportLevel: "official" | "profile" | "basic";
  note: string;
}

export const PROVIDER_TYPE_OPTIONS: ProviderTypeMeta[] = [
  {
    type: "openai_compatible",
    label: "OpenAI Compatible (Chat)",
    defaultName: "OpenAI Compatible",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    tier: "tier_2",
    routeNote: "兼容路由。通过 compat profile 决定 reasoning 和 tool continuation 行为。",
  },
  {
    type: "openai_responses",
    label: "OpenAI Responses API",
    defaultName: "OpenAI Responses",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    tier: "tier_0",
    routeNote: "Tier 0 官方直连。优先用于 OpenAI 官方接口。",
  },
  {
    type: "gemini",
    label: "Google Gemini",
    defaultName: "Google Gemini",
    baseUrlPlaceholder: "https://generativelanguage.googleapis.com/v1beta",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresApiKey: true,
    tier: "tier_0",
    routeNote: "Tier 0 官方直连。使用 @google/genai。",
  },
  {
    type: "anthropic",
    label: "Anthropic",
    defaultName: "Anthropic",
    baseUrlPlaceholder: "https://api.anthropic.com/v1",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    requiresApiKey: true,
    tier: "tier_0",
    routeNote: "Tier 0 官方直连。使用 @anthropic-ai/sdk。",
  },
  {
    type: "mistral",
    label: "Mistral",
    defaultName: "Mistral",
    baseUrlPlaceholder: "https://api.mistral.ai/v1",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    requiresApiKey: true,
    tier: "tier_0",
    routeNote: "Tier 0 官方直连。使用 @mistralai/mistralai。",
  },
];

export const OPENAI_COMPATIBLE_PROFILE_OPTIONS: OpenAICompatibleProfileMeta[] = [
  {
    value: "auto",
    label: "Auto",
    tier: "tier_2",
    supportsReasoningMode: false,
    supportsReasoningEffort: false,
    supportsReasoningBudget: false,
    supportLevel: "basic",
    note: "按域名做最小推断；适合未明确归类的兼容接口。",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    tier: "tier_1",
    supportsReasoningMode: true,
    supportsReasoningEffort: true,
    supportsReasoningBudget: false,
    supportLevel: "profile",
    note: "Tier 1。支持 thinking mode、usage 和 reasoning replay。",
  },
  {
    value: "moonshot",
    label: "Moonshot / Kimi",
    tier: "tier_1",
    supportsReasoningMode: true,
    supportsReasoningEffort: false,
    supportsReasoningBudget: false,
    supportLevel: "profile",
    note: "Tier 1。支持 thinking mode，tool continuation 需要保留 reasoning 上下文。",
  },
  {
    value: "glm",
    label: "GLM / Z.ai",
    tier: "tier_1",
    supportsReasoningMode: true,
    supportsReasoningEffort: false,
    supportsReasoningBudget: false,
    supportLevel: "profile",
    note: "Tier 1。支持 thinking mode，续轮需要保留 reasoning 上下文。",
  },
  {
    value: "qwen",
    label: "Qwen / 百炼",
    tier: "tier_2",
    supportsReasoningMode: true,
    supportsReasoningEffort: false,
    supportsReasoningBudget: true,
    supportLevel: "basic",
    note: "Tier 2。通过 enable_thinking / thinking_budget 控制；部分 thinking 模型不能关闭。",
  },
  {
    value: "minimax",
    label: "MiniMax",
    tier: "tier_2",
    supportsReasoningMode: false,
    supportsReasoningEffort: false,
    supportsReasoningBudget: false,
    supportLevel: "basic",
    note: "Tier 2。先只做基础兼容与 reasoning 输出解析，不伪造统一 thinking 开关。",
  },
  {
    value: "longcat",
    label: "LongCat",
    tier: "tier_2",
    supportsReasoningMode: false,
    supportsReasoningEffort: false,
    supportsReasoningBudget: false,
    supportLevel: "basic",
    note: "Tier 2。建议通过模型名区分 chat / thinking。",
  },
  {
    value: "mimo",
    label: "MiMo",
    tier: "tier_2",
    supportsReasoningMode: false,
    supportsReasoningEffort: false,
    supportsReasoningBudget: false,
    supportLevel: "basic",
    note: "Tier 2。官方参数未明确前，仅保留基础兼容。",
  },
  {
    value: "custom",
    label: "Custom",
    tier: "tier_2",
    supportsReasoningMode: false,
    supportsReasoningEffort: false,
    supportsReasoningBudget: false,
    supportLevel: "basic",
    note: "Tier 2。只提供基础 OpenAI-compatible 路径，不额外假设 reasoning 契约。",
  },
];

export function getProviderTypeMeta(type: AIProviderType): ProviderTypeMeta {
  return (
    PROVIDER_TYPE_OPTIONS.find((item) => item.type === type) ||
    PROVIDER_TYPE_OPTIONS[0]
  );
}

export function getOpenAICompatibleProfileMeta(
  value: OpenAICompatibleProfile,
): OpenAICompatibleProfileMeta {
  return (
    OPENAI_COMPATIBLE_PROFILE_OPTIONS.find((item) => item.value === value) ||
    OPENAI_COMPATIBLE_PROFILE_OPTIONS[0]
  );
}

export function formatTierLabel(tier: ProviderTypeMeta["tier"]) {
  switch (tier) {
    case "tier_0":
      return "Tier 0";
    case "tier_1":
      return "Tier 1";
    default:
      return "Tier 2";
  }
}
