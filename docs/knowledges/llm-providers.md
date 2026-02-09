# LLM Providers Reference

This document summarizes provider integrations in MyZ Annotator and links to official (or vendor-recommended) API documentation.

## Provider Matrix (Current Implementation)

| Provider Type | Protocol | Default Base URL (UI) | Models Endpoint | Chat/Generate Endpoint |
| --- | --- | --- | --- | --- |
| openai_compatible | OpenAI Chat Completions | https://api.openai.com/v1 | /models | /chat/completions |
| openai_responses | OpenAI Responses API | https://api.openai.com/v1 | /models | /responses |
| gemini | Gemini REST | https://generativelanguage.googleapis.com/v1beta | /models | /models/{model}:generateContent |
| anthropic | Anthropic Messages | https://api.anthropic.com/v1 | /v1/models | /v1/messages |
| moonshot | OpenAI Chat Completions | https://api.moonshot.cn/v1 | /models | /chat/completions |
| qwen | OpenAI Chat Completions (DashScope compatible) | https://dashscope.aliyuncs.com/compatible-mode/v1 | /models | /chat/completions |
| ollama | Ollama Generate | http://localhost:11434 | /api/tags | /api/generate |
| vllm | OpenAI Chat Completions | http://localhost:8000/v1 | /models | /chat/completions |
| llama_cpp | OpenAI Chat Completions | http://localhost:8080/v1 | /models | /chat/completions |

Notes:
- Self-hosted providers (Ollama/vLLM/llama.cpp) default to local base URLs and do not require API keys by default.
- OpenAI-compatible providers share the same request schema; only base URL and optional vendor parameters differ.

## Tool Calling Controls (tool_choice / strict / parallel_tool_calls)

Integration mapping notes:
- **OpenAI-compatible + OpenAI Responses**: `tool_choice` and `parallel_tool_calls` are sent as-is; `strict` toggles per-tool JSON schema enforcement (when supported by the provider).
- **Gemini**: `tool_choice` maps to `toolConfig.functionCallingConfig` (`AUTO`/`ANY`/`NONE`), with `allowedFunctionNames` when a specific tool is set. `strict` and `parallel_tool_calls` are ignored.
- **Anthropic**: `tool_choice` maps to `tool_choice` (`auto`/`any`/`tool` when applicable). `tool_choice = none` omits tools entirely. `strict` and `parallel_tool_calls` are ignored.
- **Ollama**: tools are not supported in the current integration.

## OpenAI (Responses API)

- **Endpoint**: `POST /v1/responses`
- **Models**: `GET /v1/models`
- **Docs**:
  - https://platform.openai.com/docs/api-reference/responses

Integration notes:
- The client maps our unified `messages[]` into `instructions` + `input` format for Responses.
- Tool calls are supported via `tools` in the Responses request.

## OpenAI-Compatible Providers (Chat Completions)

Includes: `openai_compatible`, `moonshot`, `qwen`, `vllm`, `llama_cpp`

Common endpoints:
- `GET /v1/models`
- `POST /v1/chat/completions`

Provider-specific notes:
- **Moonshot** uses OpenAI-compatible chat completions. The Open Platform lists both global and China endpoints.
  - Docs (global): https://platform.moonshot.ai/docs/api/chat
  - Docs (China): https://platform.moonshot.cn/docs/api/chat
- **Qwen (DashScope compatible-mode)** uses OpenAI-compatible chat completions and supports regional endpoints.
  - Docs: https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions
- **vLLM** exposes an OpenAI-compatible server.
  - Docs: https://docs.vllm.ai/en/v0.5.0/serving/openai_compatible_server.html
- **llama.cpp** provides an OpenAI-compatible HTTP server.
  - Docs: https://llama-cpp.com/

Integration notes:
- For Qwen, `extra_body.enable_thinking` is injected when model `capabilities.reasoning` is enabled.
- For Moonshot and Qwen, the base URL can be switched between global and China endpoints as needed.

## Google Gemini

- **Endpoint**: `POST /v1beta/models/{model}:generateContent`
- **Models**: `GET /v1beta/models`
- **Docs**:
  - https://ai.google.dev/api

Integration notes:
- API key must be sent via `x-goog-api-key`.
- Tool calling is mapped to Gemini `functionDeclarations` + `functionCall` / `functionResponse`.

## Anthropic

- **Endpoint**: `POST /v1/messages`
- **Models**: `GET /v1/models`
- **Docs**:
  - Messages API: https://docs.anthropic.com/en/api/messages
  - Models list: https://docs.anthropic.com/en/api/models-list

Integration notes:
- System prompts are passed via the top-level `system` field (not via `system` role messages).
- Tool calling uses `tool_use` and `tool_result` blocks.

## Ollama

- **Endpoint**: `POST /api/generate`
- **Models**: `GET /api/tags`
- **Docs**:
  - Generate: https://docs.ollama.com/api/generate
  - Base URL + intro: https://docs.ollama.com/api/introduction

Integration notes:
- We currently serialize messages into a single prompt for `/api/generate`.
- `stream: false` is used for consistent JSON responses.
