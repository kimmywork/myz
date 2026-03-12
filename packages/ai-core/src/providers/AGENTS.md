# @myz/ai-core Provider Architecture Guide

This folder contains all provider adapters (transport + protocol mapping) used by the background AI runtime. Providers are responsible for turning our internal `ProviderChatCompletionRequest` into a vendor-specific HTTP call, then normalizing responses back into a unified `ProviderChatCompletionResponse`.

## How Providers Are Wired

- Provider settings types live in `packages/ai-core/src/settings.ts`.
- The runtime creates a provider session in `packages/ai-core/src/runtime/providerSession.ts`.
- Provider clients are built via `createProviderClients()` in `packages/ai-core/src/providers/registry.ts`.
- The UI config (type, base URL, API key) is still in the extension dashboard under:
  - `myz-annotator/src/dashboard/components/ai-settings/providerCatalog.ts`
  - `myz-annotator/src/dashboard/components/ai-settings/AiProviderEditor.tsx`

## Core Building Blocks

- **OpenAI-compatible transport** (chat completions + /models):
  - `openaiCompatible/jsonClient.ts` + `runtime/openaiCompatible.ts`
  - Used by `openai_compatible`, `moonshot`, `qwen`, `vllm`, `llama_cpp`
- **Non-OpenAI adapters**:
  - OpenAI Responses: `openaiResponses/jsonClient.ts`
  - Gemini: `gemini/jsonClient.ts`
  - Anthropic: `anthropic/jsonClient.ts`
  - Ollama: `ollama/jsonClient.ts`
- **Capabilities** (composable middleware):
  - Tool loop: `capabilities/toolCalling.ts`
  - Reasoning normalization: `capabilities/reasoning.ts`
  - Streaming (OpenAI SSE): `capabilities/sseStreaming.ts`
  - Vendor quirks (Gemini, Qwen): `capabilities/googleGemini.ts`, `capabilities/qwenThinking.ts`

## Adding a New Provider

1. **Define provider type**
   - Add to `AIProviderType` in `settings.ts`.
2. **Expose UI config**
   - Add entry to `providerCatalog.ts` (label, base URL, auth requirement).
3. **Implement adapter**
   - Add a `jsonClient.ts` that implements `ChatCompletionClient`.
   - Normalize messages, tool calls, and response fields to `ProviderMessage`.
4. **Register in registry**
   - Extend `createProviderClients()` and `fetchProviderModels()` in `registry.ts`.
5. **Connection test**
   - No extra work needed if the provider returns a standard `choices[0].message.content`.
   - If it returns a structured response, normalize to string in `testProviderConnection()`.
6. **Document**
   - Update `docs/knowledges/llm-providers.md`.

## Tool Calling Rules

- Tool loop is injected by `createToolCallingCapability()`.
- Provider adapters should:
  - Return tool calls in `message.tool_calls` (OpenAI-style).
  - Accept tool results as `role: "tool"` messages (stringified content).

## Common Pitfalls

- Some vendors do not accept `system` role messages in `messages`:
  - Gemini and Anthropic require system instructions in top-level fields.
  - OpenAI Responses uses `instructions` + `input`.
- Self-hosted servers may not require API keys; the UI supports custom headers.
- Always normalize `content` into a string for `Message` storage in the agents.

## Quick Map (Provider → Adapter)

- `openai_compatible` / `moonshot` / `qwen` / `vllm` / `llama_cpp`
  - OpenAI-compatible Chat Completions `/v1/chat/completions`
- `openai_responses`
  - OpenAI Responses API `/v1/responses`
- `gemini`
  - Google Gemini `generateContent`
- `anthropic`
  - Anthropic Messages `/v1/messages`
- `ollama`
  - Ollama `/api/generate`
