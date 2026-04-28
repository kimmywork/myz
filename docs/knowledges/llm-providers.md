# LLM Providers Reference

This document summarizes provider integrations in MyZ Annotator and links to official (or vendor-recommended) API documentation.

## Provider Matrix (Current Implementation)

| Provider Type | Protocol | Default Base URL (UI) | Models Endpoint | Chat/Generate Endpoint |
| --- | --- | --- | --- | --- |
| openai_compatible | OpenAI Chat Completions | https://api.openai.com/v1 | /models | /chat/completions |
| openai_responses | OpenAI Responses API | https://api.openai.com/v1 | /models | /responses |
| gemini | Gemini REST | https://generativelanguage.googleapis.com/v1beta | /models | /models/{model}:generateContent |
| anthropic | Anthropic Messages | https://api.anthropic.com/v1 | /v1/models | /v1/messages |
| mistral | Mistral Chat Completions | https://api.mistral.ai/v1 | /v1/models | /v1/chat/completions |

Notes:
- OpenAI-compatible providers no longer assume one universal reasoning contract. Vendor-specific request shaping is controlled by `compatProfile`.
- Tier 1 profiles: `deepseek` / `moonshot` / `glm`
- Tier 2 profiles: `qwen` / `minimax` / `longcat` / `mimo` / `custom`

## Tool Calling Controls (tool_choice / strict / parallel_tool_calls)

Integration mapping notes:
- **OpenAI-compatible + OpenAI Responses**: `tool_choice` and `parallel_tool_calls` are sent as-is; `strict` toggles per-tool JSON schema enforcement (when supported by the provider).
- **Gemini**: `tool_choice` maps to `toolConfig.functionCallingConfig` (`AUTO`/`ANY`/`NONE`), with `allowedFunctionNames` when a specific tool is set. `strict` and `parallel_tool_calls` are ignored.
- **Anthropic**: `tool_choice` maps to `tool_choice` (`auto`/`any`/`tool` when applicable). `tool_choice = none` omits tools entirely. `strict` and `parallel_tool_calls` are ignored.

## OpenAI (Responses API)

- **Endpoint**: `POST /v1/responses`
- **Models**: `GET /v1/models`
- **Docs**:
  - https://platform.openai.com/docs/api-reference/responses

Integration notes:
- The client maps our unified `messages[]` into `instructions` + `input` format for Responses.
- Tool calls are supported via `tools` in the Responses request.

## OpenAI-Compatible Providers (Chat Completions)

Includes: `openai_compatible`

Common endpoints:
- `GET /v1/models`
- `POST /v1/chat/completions`

Integration notes:
- OpenAI-compatible transport is implemented through the official `openai` SDK with custom auth/header handling for self-hosted or third-party compatible endpoints.
- Some non-official compatible backends require assistant `reasoning_content` to be replayed on follow-up turns; this is now decided by `compatProfile`, not by a generic fallback assumption alone.
- DeepSeek / Moonshot / GLM are Tier 1 profiles and receive explicit reasoning patching.
- Qwen is patched via `enable_thinking` / `thinking_budget` when configured.

## Google Gemini

- **Endpoint**: `POST /v1beta/models/{model}:generateContent`
- **Models**: `GET /v1beta/models`
- **Docs**:
  - https://ai.google.dev/api

Integration notes:
- API key must be sent via `x-goog-api-key`.
- Tool calling is mapped to Gemini `functionDeclarations` + `functionCall` / `functionResponse`.
- Gemini transport and model listing are implemented via `@google/genai`.

## Anthropic

- **Endpoint**: `POST /v1/messages`
- **Models**: `GET /v1/models`
- **Docs**:
  - Messages API: https://docs.anthropic.com/en/api/messages
  - Models list: https://docs.anthropic.com/en/api/models-list

Integration notes:
- System prompts are passed via the top-level `system` field (not via `system` role messages).
- Tool calling uses `tool_use` and `tool_result` blocks.
- Anthropic transport and model listing are implemented via `@anthropic-ai/sdk`.

## Mistral

- **Endpoint**: `POST /v1/chat/completions`
- **Models**: `GET /v1/models`
- **Docs**:
  - https://docs.mistral.ai/api/
  - https://docs.mistral.ai/capabilities/reasoning/

Integration notes:
- Mistral transport and model listing are implemented via `@mistralai/mistralai`.
- Mistral is treated as a Tier 0 provider and must not be routed through `openai_compatible`.
- Reasoning configuration is provider-aware and currently maps to the official SDK path rather than OpenAI-compatible compatibility fields.
