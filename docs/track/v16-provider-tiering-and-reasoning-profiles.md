# v16-provider-tiering-and-reasoning-profiles

## Vision
- 为当前仅保留的四类 provider runtime 建立清晰的支持分层：Tier 0 / Tier 1 / Tier 2。
- 将 `openai_compatible` 的能力控制从“泛化兼容”改成“按供应商 profile 做显式适配”。
- 让 `myz-annotator` 与 `myz-bot` 在 streaming、reasoning、usage、tool continuation 上共享同一套 provider profile 契约。

## Background / Motivation
- 当前运行时已收敛为四类 provider：
  - `openai_compatible`
  - `openai_responses`
  - `anthropic`
  - `gemini`
- 但 `openai_compatible` 内部仍缺少供应商级 profile，导致 reasoning 开关、`reasoning_content` 回放、usage 统计和 streaming 参数只能靠宽泛逻辑处理。
- 这已经暴露出兼容性问题，例如某些第三方在 thinking mode 下要求 tool continuation 必须回传 `reasoning_content`，否则直接返回 `400 invalid_request_error`。
- 继续沿用“统一参数假设”会让 Settings UI、schema、runtime patching 和测试矩阵都不稳定。

## Scope
- 定义 Tier 0 / Tier 1 / Tier 2 provider 分层和对应配置方式。
- 为 `openai_compatible` 增加 `compatProfile` 抽象，并让 runtime 按 profile 注入 reasoning / streaming / replay 逻辑。
- 约束 Settings UI：只展示当前 profile 真正支持的 reasoning 控件。
- 明确 `myz-bot` 与 `myz-annotator` 必须共用同一套 profile 逻辑，不允许分叉。

## Non-Goals
- 不重新引入新的 provider type。
- 不做“额外隐藏兼容”，即未列入 profile 的供应商不承诺 reasoning 行为正确。
- 不在本阶段支持 Azure OpenAI、AWS Bedrock、Vertex AI 这类需要额外认证或 endpoint 语义的专用接入方式。
- 不把聚合网关（如 OpenRouter）作为 reasoning 语义的基准来源。

## Tier Model

### Tier 0: 官方直连，强保证
- 目标：最稳定、最完整、最少兼容假设。
- Provider 类型与配置：
  - OpenAI：`type = "openai_responses"`
  - Anthropic：`type = "anthropic"`
  - Google Gemini：`type = "gemini"`
  - Mistral：后续新增官方 `mistral` provider type，直连 `@mistralai/mistralai`
- 规则：
  - 不使用 `compatProfile`
  - 直接走对应官方 SDK
  - reasoning / streaming / usage / tool calling 以官方 SDK 与官方 API 契约为准
- 配置方式：
  - OpenAI
    - `type: "openai_responses"`
    - `baseUrl: "https://api.openai.com/v1"`
    - `apiKey: <OPENAI_API_KEY>`
  - Anthropic
    - `type: "anthropic"`
    - `baseUrl: "https://api.anthropic.com/v1"`
    - `apiKey: <ANTHROPIC_API_KEY>`
  - Gemini
    - `type: "gemini"`
    - `baseUrl: "https://generativelanguage.googleapis.com/v1beta"`
    - `apiKey: <GEMINI_API_KEY>`
  - Mistral
    - `type: "mistral"`（需在后续版本重新引入 provider type）
    - `baseUrl: "https://api.mistral.ai/v1"`
    - `apiKey: <MISTRAL_API_KEY>`
- 说明：
  - OpenAI 官方一律优先 `openai_responses`，不建议再通过 `openai_compatible` 接 OpenAI 官方接口。
  - Mistral 若纳入 Tier 0，必须走官方 SDK，不应再通过 `openai_compatible` 假装完全等价。

### Tier 1: 主力支持的 OpenAI-compatible
- 目标：对国内主流、确有 reasoning / tool continuation 需求的供应商做显式适配。
- Provider 类型与配置：
  - `type = "openai_compatible"`
  - `compatProfile in ["deepseek", "moonshot", "glm"]`
- 规则：
  - 必须有供应商级请求 patching
  - 必须有 profile 级 reasoning replay 策略
  - 必须有 streaming usage 路径测试
  - Settings UI 必须展示 profile 专属说明

### Tier 2: 次级支持，能力有限或语义未完全确认
- 目标：支持主流供应商接入，但不承诺完整 reasoning 语义。
- Provider 类型与配置：
  - `type = "openai_compatible"`
  - `compatProfile in ["qwen", "minimax", "longcat", "mimo", "custom"]`
- 规则：
  - 只对已官方确认的参数做 patching
  - 没有官方契约的 reasoning 开关，不伪造通用能力
  - 优先保证基础 chat / streaming / usage / tool calling 可用
  - reasoning 若无官方文档支撑，则回退为 `provider_default`

## Data Model

### 新增字段
- `AIProviderSetting.compatProfile?: OpenAICompatibleProfile`
- `OpenAICompatibleProfile` 建议枚举：
  - `auto`
  - `deepseek`
  - `moonshot`
  - `glm`
  - `qwen`
  - `minimax`
  - `longcat`
  - `mimo`
  - `custom`

### 建议新增的 reasoning 设置
- `reasoningMode?: "provider_default" | "enabled" | "disabled"`
- `reasoningEffort?: "provider_default" | "low" | "medium" | "high"`
- `reasoningBudget?: number`

### 设计约束
- `compatProfile` 只对 `type = "openai_compatible"` 生效。
- Tier 不单独持久化，由 `type + compatProfile` 推导，避免 UI 文案和 schema 产生双重来源。
- UI 必须按 profile 决定是否展示：
  - reasoning 开关
  - reasoning effort
  - reasoning budget
  - provider 限制说明

## Provider Profile Matrix

| Tier | Provider / Profile | 推荐配置 | reasoning 开关 | effort | budget | replay `reasoning_content` | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | OpenAI / `openai_responses` | 官方 SDK | 原生 | 原生 | 原生 | 不适用 | 官方首选路径 |
| 0 | Anthropic / `anthropic` | 官方 SDK | 原生 | 原生 | 原生 | 不适用 | 官方首选路径 |
| 0 | Gemini / `gemini` | 官方 SDK | 原生 | 原生 | 原生 | 不适用 | 已有 Gemini thinking patch |
| 0 | Mistral / `mistral` | 官方 SDK | 原生 | `reasoning_effort` | 原生 | 不适用 | 需新增官方 provider type |
| 1 | DeepSeek / `deepseek` | `openai_compatible` + profile | `thinking.type` | 支持 | 未确认统一 budget | 必须 | tool continuation 必须回放 reasoning |
| 1 | Moonshot / `moonshot` | `openai_compatible` + profile | `thinking.type` | 未确认 | 未确认 | 必须 | thinking + tools 有明确约束 |
| 1 | GLM / `glm` | `openai_compatible` + profile | `thinking.type` | 未确认 | 未确认 | 必须 | interleaved / preserved thinking 需 profile 控制 |
| 2 | Qwen / `qwen` | `openai_compatible` + profile | `enable_thinking` | 不做统一 effort | `thinking_budget` | 第二阶段确认 | 某些模型无法关闭 thinking |
| 2 | MiniMax / `minimax` | `openai_compatible` + profile | 不做统一开关 | 未确认 | 未确认 | 第二阶段确认 | 先支持 `reasoning_split` 解析 |
| 2 | LongCat / `longcat` | `openai_compatible` + profile | 模型级 | 无 | 无 | 否 | 以 `Chat` / `Thinking` 模型名区分 |
| 2 | MiMo / `mimo` | `openai_compatible` + profile | 未确认 | 未确认 | 未确认 | 否 | 在官方参数明确前只保留 custom 级保障 |
| 2 | Custom / `custom` | `openai_compatible` + profile | 不承诺 | 不承诺 | 不承诺 | 默认否 | 仅做基础 OpenAI-compatible |

## Request Mapping Rules

### Tier 0
- OpenAI：继续走 `openai` SDK `responses` 客户端。
- Anthropic：继续走 `@anthropic-ai/sdk`。
- Gemini：继续走 `@google/genai`。
- Mistral：后续走 `@mistralai/mistralai` 官方客户端。

### Tier 1
- `deepseek`
  - `reasoningMode = enabled|disabled` -> `extra_body.thinking.type`
  - `reasoningEffort` -> `reasoning_effort`，仅在 profile 明确支持时下发
  - streaming -> `stream_options.include_usage = true`
  - tool continuation -> 回放本轮 assistant `reasoning_content`
- `moonshot`
  - `reasoningMode = enabled|disabled` -> `extra_body.thinking.type`
  - streaming -> `stream_options.include_usage = true`
  - tool continuation -> 回放本轮 assistant `reasoning_content`
  - 若 `reasoningMode = enabled`，对 `tool_choice` 做 provider 限制校验
- `glm`
  - `reasoningMode = enabled|disabled` -> `extra_body.thinking.type`
  - preserved thinking 后续通过 profile 扩展，不做全局默认开启
  - tool continuation -> 回放 reasoning blocks

### Tier 2
- `qwen`
  - `reasoningMode = enabled|disabled` -> `extra_body.enable_thinking = boolean`
  - `reasoningBudget` -> `extra_body.thinking_budget`
  - 流式 usage 继续使用 `stream_options.include_usage = true`
  - 对“仅 thinking 模型无法关闭”做 UI 提示，不在 runtime 猜测强改
- `minimax`
  - 第一阶段只支持 `extra_body.reasoning_split = true` 的响应解析
  - 不提供伪通用 `enabled|disabled`
- `longcat`
  - 不下发 reasoning 参数
  - 通过模型名选择 `*-Thinking` 或 `*-Chat`
- `mimo`
  - 在官方文档明确前，不做 reasoning 参数下发
- `custom`
  - 仅保留已有 OpenAI-compatible 基础能力

## UX / Flow
- 新建 Provider 时：
  - 先选 `Provider Type`
  - 当 `type = "openai_compatible"` 时，再展示 `Compatibility Profile`
- UI 分层文案：
  - Tier 0：官方直连，强保证
  - Tier 1：优先支持，含 reasoning/profile 适配
  - Tier 2：基础兼容，部分 reasoning 特性受限
- 模型编辑页：
  - reasoning 能力仍是模型级 capability
  - 但实际可配置项由 provider profile 决定
- 测试连接页：
  - 附加显示本 provider 的 tier 与 profile

## Implementation Plan

### Phase 1: Schema + Runtime 抽象
- 为 `AIProviderSetting` 增加 `compatProfile`
- 增加 profile 推导与 capability helper
- 将“是否回放 reasoning_content”从 baseUrl 猜测改成 profile 规则

### Phase 2: Tier 1 完整落地
- 实现 `deepseek` / `moonshot` / `glm` 请求 patching
- 为三者补 streaming + usage + replay 测试
- 在 `myz-bot` 复用同一套 profile 逻辑

### Phase 3: Tier 2 基础落地
- 实现 `qwen` 请求 patching
- 实现 `minimax` reasoning 输出解析
- 为 `longcat` / `mimo` / `custom` 补 profile 约束与 UI 提示

### Phase 4: Settings UI 与文档
- Provider 编辑器增加 `compatProfile`
- reasoning 控件按 profile 条件显示
- 更新 README / CHANGELOG / AGENTS 中的 provider 约束说明

### Phase 5: Tier 0 扩展候选
- 若确认放开“四类 provider”限制，则新增 `mistral` provider type
- 接入 `@mistralai/mistralai`
- 为 Mistral 的 reasoning / streaming / usage 增加独立测试

## Acceptance Criteria
- Given 用户选择 Tier 0 provider，When 保存设置，Then 不出现 `compatProfile` 配置项。
- Given 用户选择 `type = "openai_compatible"`，When 选择 `deepseek` / `moonshot` / `glm`，Then UI 必须显示对应 reasoning 能力说明。
- Given `compatProfile = "deepseek"` 且开启 thinking，When 发生 tool continuation，Then assistant `reasoning_content` 必须被回放。
- Given `compatProfile = "moonshot"` 且启用 stream，When 请求发出，Then payload 必须包含 `stream_options.include_usage = true`。
- Given `compatProfile = "qwen"`，When 用户设置 `reasoningBudget`，Then runtime 必须将其映射为 `thinking_budget`。
- Given `compatProfile = "custom"`，When 用户开启 reasoning，Then 若该 profile 无官方参数映射，runtime 不得伪造供应商专用字段。

## Verification Plan
- `packages/ai-core`
  - 增加 profile request patching 单测
  - 增加 reasoning replay policy 单测
  - 增加 usage / stream_options.include_usage 单测
- `myz-annotator`
  - `npm run test:dev -- tests/unit/background/ai/providerClients.test.ts tests/unit/background/ai/openaiCompatibleRuntime.test.ts tests/unit/background/ai/providerCapabilities.test.ts`
  - `npm run build`
- `myz-bot`
  - `npm test`
  - `npm run build`

## Risks / Rollback
- 风险：把 reasoning 控件做成“全局统一字段”会误导用户，以为所有兼容供应商都支持同样的开关。
- 风险：若继续按 baseUrl 判断 replay，会在同一供应商的代理网关场景下误判。
- 风险：聚合型 provider 会隐藏真实上游模型语义，导致 reasoning 参数表面兼容但行为不稳定。
- 回退方案：若某个 profile 的官方文档不足或行为漂移，降级为 `custom`，仅保留基础 OpenAI-compatible 能力。

## Additional Providers To Consider
- `xAI / Grok`
  - 建议纳入观察名单，但不放入第一阶段。
  - 原因：截至 2026-04-28，xAI 官方将 Chat Completions 标为 legacy，新增能力优先进入 Responses API；其文档还明确指出 Responses API 对 reasoning 模型支持更完整，而 Chat Completions 的 reasoning 输出能力有限。
- `Mistral`
  - 调整为 Tier 0 候选，并优先于大多数兼容网关。
  - 原因：官方 reasoning 契约清晰，既有 `reasoning_effort`，也有原生 reasoning 模型，而且存在官方 SDK `@mistralai/mistralai`。
  - 前提：这意味着需要重新放开当前“四类 provider”限制，新增官方 `mistral` provider type。
- `Groq`
  - 值得纳入观察名单。
  - 原因：OpenAI-compatible 做得较完整，且支持 Chat/Responses。
  - 但官方文档明确列出若干不支持字段，更适合作为“高速网关型 provider”，不是 reasoning 语义基准。
- `Together` / `Fireworks`
  - 可以考虑，但优先级低于 xAI / Mistral / Groq。
  - 原因：更偏模型托管与推理网关，reasoning 语义往往跟随上游模型而不是平台自身。
- `OpenRouter`
  - 可以考虑为单独网关层，但不建议作为 Tier 1/2 reasoning 基准。
  - 原因：其优势是统一访问与 fallback，不是稳定的 vendor-specific reasoning 契约。
- `Azure OpenAI`
  - 商业上重要，但应视作单独接入项，而不是 `openai_compatible` profile。
  - 原因：认证、endpoint、版本化路径和企业网络约束与普通 OpenAI-compatible 不同。

## Recommended Priority
1. Tier 0：OpenAI / Anthropic / Gemini
2. Tier 0 扩展候选：Mistral
3. Tier 1：DeepSeek / Moonshot / GLM
4. Tier 2：Qwen / MiniMax / LongCat / MiMo / Custom
5. 观察名单：xAI(Grok) / Groq / Together / Fireworks / OpenRouter / Azure OpenAI

## Change Log
- 2026-04-28：新增 provider 分层与 reasoning profile 方案，明确 Tier 0 / Tier 1 / Tier 2、配置方式、runtime 映射与后续实施顺序。
- 2026-04-28：将 Mistral 调整为 Tier 0 官方 SDK 路线候选，并补充其配置方式与实施前提。
