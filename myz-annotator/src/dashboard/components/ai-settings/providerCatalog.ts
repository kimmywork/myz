import type { AIProviderType } from "@/background/settings.js"

export interface ProviderTypeMeta {
  type: AIProviderType
  label: string
  defaultName: string
  baseUrlPlaceholder: string
  defaultBaseUrl: string
  requiresApiKey: boolean
}

export const PROVIDER_TYPE_OPTIONS: ProviderTypeMeta[] = [
  {
    type: "openai_compatible",
    label: "OpenAI Compatible (Chat)",
    defaultName: "OpenAI Compatible",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
  },
  {
    type: "openai_responses",
    label: "OpenAI Responses API",
    defaultName: "OpenAI Responses",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
  },
  {
    type: "gemini",
    label: "Google Gemini",
    defaultName: "Google Gemini",
    baseUrlPlaceholder: "https://generativelanguage.googleapis.com/v1beta",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresApiKey: true,
  },
  {
    type: "anthropic",
    label: "Anthropic",
    defaultName: "Anthropic",
    baseUrlPlaceholder: "https://api.anthropic.com/v1",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    requiresApiKey: true,
  },
  {
    type: "moonshot",
    label: "Moonshot",
    defaultName: "Moonshot",
    baseUrlPlaceholder: "https://api.moonshot.cn/v1",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    requiresApiKey: true,
  },
  {
    type: "qwen",
    label: "Qwen (DashScope)",
    defaultName: "Qwen",
    baseUrlPlaceholder: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    requiresApiKey: true,
  },
  {
    type: "ollama",
    label: "Ollama",
    defaultName: "Ollama",
    baseUrlPlaceholder: "http://localhost:11434",
    defaultBaseUrl: "http://localhost:11434",
    requiresApiKey: false,
  },
  {
    type: "vllm",
    label: "vLLM",
    defaultName: "vLLM",
    baseUrlPlaceholder: "http://localhost:8000/v1",
    defaultBaseUrl: "http://localhost:8000/v1",
    requiresApiKey: false,
  },
  {
    type: "llama_cpp",
    label: "llama.cpp",
    defaultName: "llama.cpp",
    baseUrlPlaceholder: "http://localhost:8080/v1",
    defaultBaseUrl: "http://localhost:8080/v1",
    requiresApiKey: false,
  },
]

export function getProviderTypeMeta(type: AIProviderType): ProviderTypeMeta {
  return (
    PROVIDER_TYPE_OPTIONS.find((item) => item.type === type) ||
    PROVIDER_TYPE_OPTIONS[0]
  )
}

