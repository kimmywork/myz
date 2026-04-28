# v14-provider-sdk-migration

## Vision
- 将 `packages/ai-core` 中 OpenAI-compatible、OpenAI Responses、Anthropic、Gemini 的传输层切换到官方 SDK。
- 降低手写 HTTP / SSE 协议兼容成本，同时保留现有统一消息、tool calling、reasoning 和 UI 流程。

## Background / Motivation
- 当前 provider 适配器大量依赖手写 `fetch`、请求体拼装和 SSE 解析。
- 第三方 OpenAI-compatible 服务在 `stream`、`reasoning_content`、工具续轮等细节上差异较大，纯手写传输层容易漏兼容项。
- 用户明确要求：
  - OpenAI 相关调用改用 `openai` SDK。
  - Anthropic 相关调用改用 `@anthropic-ai/sdk`。
  - Gemini 相关调用改用 `@google/genai`。
  - 其他 OpenAI-compatible provider type 复用 OpenAI SDK。

## Scope
- 包含 `packages/ai-core` 中以下 provider transport 迁移：
  - `openai_compatible`
  - `moonshot`
  - `qwen`
  - `vllm`
  - `llama_cpp`
  - `openai_responses`
  - `anthropic`
  - `gemini`
- 包含 models fetch、连接测试、streaming、tool payload、debug hook、custom headers 和 browser-extension 场景兼容。
- 包含测试、`AGENTS.md`、`CHANGELOG.md` 和依赖清单更新。

## Non-Goals
- 不替换 Ollama provider。
- 不重写 prompt builder、tool loop、reasoning normalization 或消息 schema。
- 不改动 Dashboard/Sidepanel 的交互逻辑。

## Data Model (schema-first)
- 不新增 schema 字段。
- 继续沿用现有 `ProviderChatCompletionRequest` / `ProviderMessage` / `Message.reasoning_content`。
- SDK 层只负责传输和原始事件消费；统一消息映射继续在 `ai-core` 内完成。

## UX / Flow
- 用户在 Settings 中配置 provider 和模型。
- Background runtime 仍通过统一 provider client 发起请求。
- SDK 负责：
  - OpenAI-compatible Chat Completions
  - OpenAI Responses
  - Anthropic Messages
  - Gemini generateContent / streamGenerateContent / models.list
- 适配器继续输出统一的 `ProviderChatCompletionResponse`，上层无感知。

## Dependencies / Constraints
- `packages/ai-core` 新增依赖：
  - `openai`
  - `@anthropic-ai/sdk`
  - `@google/genai`
- 必须启用浏览器扩展环境可运行的 SDK 选项。
- 必须保留自定义 headers 和“无 API key 的自托管 OpenAI-compatible endpoint”兼容能力。
- 必须保留调试能力：`emitProviderRequestDebug()` 仍要能看到最终请求体里的 `stream` 值。

## Acceptance Criteria
- Given provider type 为 `openai_compatible` / `moonshot` / `qwen` / `vllm` / `llama_cpp`，When 发送请求，Then 必须通过 OpenAI SDK 发起 Chat Completions 调用。
- Given provider type 为 `openai_responses`，When 发送请求，Then 必须通过 OpenAI SDK 发起 Responses 调用。
- Given provider type 为 `anthropic`，When 发送请求，Then 必须通过 Anthropic SDK 发起 Messages 调用。
- Given provider type 为 `gemini`，When 发送请求或拉取模型列表，Then 必须通过 `@google/genai` 发起 generateContent / generateContentStream / models.list 调用。
- Given Settings 中 `streamingEnabled` 为开启，When 测试连接或对话流式请求发出，Then 实际请求体中的 `stream` 必须为 `true`。
- Given 用户配置了自定义 headers 或没有 API key 的 OpenAI-compatible 自托管地址，When 发起请求，Then 不允许 SDK 自动注入错误的默认鉴权头。

## Verification Plan
- 单元测试：
  - `providerClients.test.ts`
  - `providerRegistry.test.ts`
  - `providerFactory.test.ts`
  - `providerCapabilities.test.ts`
  - `openaiCompatibleRuntime.test.ts`
- 构建验证：
  - `npm run build` in `myz-annotator`
- 手动验证：
  - Settings 测试连接：OpenAI-compatible + streaming
  - 连续两轮对话：OpenAI-compatible reasoning
  - Anthropic 普通对话与工具调用
  - Gemini 普通对话、流式对话与模型拉取

## Risks / Rollback
- 风险：SDK 默认鉴权逻辑覆盖现有自定义 headers，导致自托管 provider 失败。
- 风险：SDK stream 事件与现有 SSE 解析结果不完全一致，导致 tool delta 或 reasoning 丢失。
- 回退方案：保留现有消息映射函数，若 SDK stream 不兼容则仅回退 transport 层实现。

## Use Cases / Scenarios
- 主路径：
  - 使用第三方 OpenAI-compatible provider 发起普通聊天与流式聊天。
  - 使用 Gemini provider 发起普通聊天、流式聊天与模型列表读取。
- 边界路径 1：
  - 仅配置自定义 Authorization header，不配置 API key。
- 边界路径 2：
  - 启用 tool calling，模型返回多个 tool call delta。
- 失败路径：
  - SDK 返回 4xx/5xx，系统仍输出统一错误信息。

## Boundary Conditions
- `stream: true` 且 provider 返回 tool call delta。
- `reasoning_content` 仅在 assistant 历史重放时按现有策略处理。
- OpenAI-compatible endpoint 不是标准 `/v1` 根路径。
- Anthropic payload 中同时包含 text block 和 `tool_use` block。

## Change Log
- 2026-04-28：新增 SDK 迁移方案，覆盖 OpenAI-compatible、OpenAI Responses、Anthropic transport 层与相关验证路径。
- 2026-04-28：补充 Gemini 到迁移范围，改用 `@google/genai` 处理 completion、streaming 与 models list。
