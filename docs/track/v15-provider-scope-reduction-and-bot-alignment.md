# v15-provider-scope-reduction-and-bot-alignment

## Vision
- 将仓库内 AI provider 范围收敛到四类：`openai_compatible`、`openai_responses`、`gemini`、`anthropic`。
- 让 `myz-bot` 与 `myz-annotator` 统一复用 `packages/ai-core` 的官方 SDK transport，避免重复维护 provider 兼容层。

## Background / Motivation
- `packages/ai-core` 已经把 OpenAI-compatible、OpenAI Responses、Anthropic、Gemini 迁移到官方 SDK。
- 仓库中仍然暴露了 `moonshot`、`qwen`、`ollama`、`vllm`、`llama_cpp` 等 provider type，造成设置面、schema、文档和测试面不一致。
- `myz-bot` 虽然复用了 `createProviderSession()`，但它自己的配置 schema 仍接受任意 provider 字符串，且默认只对 `openai_responses` 开启流式请求，未完整利用新的 SDK client 能力。

## Scope
- 更新 `packages/ai-core` provider type schema、registry、runtime helper 和文档，只保留四类 provider。
- 更新 `myz-annotator` 的 settings schema、Settings UI、streaming 判定、测试与文档，只保留四类 provider。
- 更新 `myz-bot` 的配置 schema、init 模板、README、测试与请求策略：
  - provider 仅允许四类
  - 复用 `ai-core` SDK-backed client 做 streaming
  - Gemini reasoning 配置必须真正传递到底层 SDK 请求

## Non-Goals
- 不扩展新的 provider type。
- 不保留 `moonshot` / `qwen` / `ollama` / `vllm` / `llama_cpp` 的兼容分支或“隐藏支持”。
- 不修改 screen-recording skill 中与 `qwen-tts` / `ollama` 相关的独立脚本，这些不属于 assistant provider runtime。

## Data Model
- `AIProviderType` 只允许：
  - `openai_compatible`
  - `openai_responses`
  - `gemini`
  - `anthropic`
- `myz-bot` 的 `bot.yml` 中：
  - `ai.provider` 必须是上述四类之一
  - `ai.streamingEnabled` 新增为布尔值，默认 `true`

## UX / Flow
- `myz-annotator` Settings 页面不再展示已删除 provider 类型。
- 旧 settings / bot.yml 若继续使用被删除的 provider type，schema 解析必须直接失败，而不是静默回退。
- `myz-bot` 对四类 provider 默认可走流式请求，由 `ai-core` 聚合最终响应。

## Dependencies / Boundaries
- `myz-bot` 的 provider transport 不应自行实现，应继续通过 `@myz/ai-core/runtime/providerSession` 复用。
- Gemini reasoning 依赖 `createGoogleGeminiThinkingCapability()` 注入的 `extra_body.google.thinking_config.include_thoughts`，Gemini SDK 组包必须消费它。

## Acceptance Criteria
- Given 用户打开 `myz-annotator` Settings，When 新建 provider，Then 可选类型只能是四类。
- Given `AIProviderType` schema 被解析，When 输入 `moonshot` / `qwen` / `ollama` / `vllm` / `llama_cpp`，Then 必须报错而不是继续运行。
- Given `myz-bot` 配置 `openai_compatible` / `openai_responses` / `gemini` / `anthropic`，When 发起请求，Then 必须通过 `ai-core` 的官方 SDK transport 处理。
- Given `myz-bot` 配置 `streamingEnabled: true`，When 发起四类 provider 请求，Then request path 必须走流式能力。
- Given `myz-bot` 配置 Gemini 且 `capabilities.reasoning = true`，When 发起请求，Then 最终 Gemini SDK 请求体中必须包含 `generationConfig.thinkingConfig.includeThoughts = true`。

## Verification Plan
- `myz-annotator`
  - `npm run test:dev -- tests/unit/background/ai/providerClients.test.ts tests/unit/background/ai/providerRegistry.test.ts tests/unit/background/ai/providerCapabilities.test.ts tests/unit/background/ai/openaiCompatibleRuntime.test.ts`
  - `npm run build`
- `myz-bot`
  - `npm test`
  - `npm run build`

## Risks / Rollback
- 风险：用户现有配置仍使用被删除 provider type，升级后会在 schema 解析时报错。
- 风险：`myz-bot` 对更多 provider 开启 stream 后，若第三方非官方 backend 不支持流式，将更快暴露兼容问题。
- 回退方案：若确需恢复旧 provider type，必须以新的版本化设计重新引入，不允许保留“未文档化兼容”。

## Use Cases / Boundary Conditions
- 主路径：
  - `myz-annotator` 使用四类 provider 完成模型列表拉取、测试连接、对话与 tool calling。
  - `myz-bot` 使用 `openai_compatible` / `gemini` 发起流式请求。
- 边界路径：
  - `myz-bot` bot.yml 中存在已删除 provider type。
  - Gemini 开启 reasoning 时，请求必须包含 thinkingConfig。
  - `openai_responses` 仍只在官方 `api.openai.com` 上启用 `previous_response_id` / `prompt_cache_key`。

## Change Log
- 2026-04-28：新增 provider 范围收缩与 `myz-bot` 对齐计划，覆盖 schema、registry、UI、bot config 与验证路径。
