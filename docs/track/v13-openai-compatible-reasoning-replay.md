# v13-openai-compatible-reasoning-replay

## Vision
- 修复第三方 OpenAI-compatible Chat Completions 接口在 thinking mode 下的多轮会话失败问题。
- 当供应商要求回传 `reasoning_content` 时，第二轮及后续工具续轮必须继续成功。

## Background / Motivation
- 当前 `myz-annotator` 会存储 assistant 的 `reasoning_content` 供 UI 展示，但后续请求重放历史时不会回传该字段。
- 部分第三方 OpenAI-compatible 提供商在开启 thinking mode 后，会校验上一轮 assistant 的 `reasoning_content` 是否被原样带回。
- 结果是首轮请求成功，第二轮普通对话或 tool-calling 续轮会返回：
  - `The reasoning_content in the thinking mode must be passed back to the API.`

## Scope
- 包含 `packages/ai-core` 中 OpenAI-compatible provider 的 reasoning 回放策略。
- 包含 `myz-annotator` 对话历史重放时的 assistant reasoning 回显控制。
- 包含相关单元测试、`AGENTS.md` 说明和 `CHANGELOG.md` 记录。

## Non-Goals
- 不引入新的 provider 类型。
- 不改动 Gemini / Anthropic / OpenAI Responses 的消息协议。
- 不做历史数据迁移。

## Data Model (schema-first)
- 不新增 schema 字段。
- 继续复用现有 `Message.reasoning_content?: string`。
- 回放规则：
  - 仅 assistant 消息可带回 `reasoning_content`。
  - 仅当前 provider 允许 reasoning 回放时才带回。
  - 若历史消息显式记录了其他 `providerId`，则不回放该条 reasoning。

## UX / Flow
- 用户配置第三方 OpenAI-compatible provider 并开启 reasoning。
- 首轮回复返回 `reasoning_content`。
- 用户继续追问，或模型发起 tool call 后进入续轮。
- 后续请求自动携带上一轮 assistant 的 `reasoning_content`，接口不再报错。

## Dependencies / Constraints
- 依赖 `packages/ai-core` 的 provider capability 组合顺序：reasoning normalization 必须先于 tool-calling continuation。
- 必须避免把该策略错误应用到 `api.openai.com` 官方 Chat Completions。
- 历史重放只允许引用本轮 provider 的 assistant reasoning，避免用户切换 provider 后把旧 provider 的 thinking 回传给新 provider。

## Acceptance Criteria
- Given 第三方 OpenAI-compatible provider 返回了 assistant `reasoning_content`，When 同一 provider 发起下一轮普通对话，Then 请求历史中的对应 assistant 消息必须带有 `reasoning_content`。
- Given 第三方 OpenAI-compatible provider 在同一轮中返回 tool call 和 `reasoning_content`，When 工具结果回传后继续续轮，Then follow-up assistant 消息必须带有 `reasoning_content`。
- Given 当前 provider 为 `https://api.openai.com/v1`，When 重放历史消息，Then 不允许自动附加 `reasoning_content`。
- Given 历史 assistant 消息的 `metadata.providerId` 与当前 provider 不一致，When 重放历史消息，Then 不允许附加该条 `reasoning_content`。

## Verification Plan
- 单元测试：`openaiCompatibleRuntime.test.ts` 覆盖 reasoning replay 启用条件。
- 单元测试：`providerCapabilities.test.ts` 覆盖 tool loop 中 reasoning continuation。
- 单元测试：`conversationPrompt.test.ts` 覆盖历史消息重放时 assistant reasoning 的条件附加。
- 手动验证：在第三方 OpenAI-compatible provider 开启 reasoning 后连续发送两轮消息，确认不再出现 `reasoning_content` 缺失错误。

## Risks / Rollback
- 风险：将 `reasoning_content` 发给不接受该字段的接口，导致兼容性回退。
- 约束：仅对非官方 OpenAI base URL 的 OpenAI-compatible 系列启用自动回放，降低误发风险。
- 回退方案：撤销 reasoning replay helper 与 prompt/tool-calling 透传逻辑，恢复旧行为。

## Use Cases / Scenarios
- 主路径：
  - 用户使用第三方 OpenAI-compatible reasoning 模型进行两轮连续对话，第二轮成功返回。
- 边界路径 1：
  - 模型在第一轮只返回 reasoning + tool call，无可见文本；工具续轮仍成功。
- 边界路径 2：
  - 用户在同一对话中切换到其他 provider；旧 provider 的 reasoning 不应被回放。
- 失败路径：
  - 第三方 provider 未返回 `reasoning_content`；系统不得主动构造虚假的 reasoning 字段。

## Boundary Conditions
- assistant `content` 为空但 `reasoning_content` 存在。
- assistant 既有 `tool_calls` 又有 `reasoning_content`。
- `metadata.providerId` 缺失。
- 当前 provider base URL 为官方 OpenAI。

## Open Questions
- 若后续接入更多要求 reasoning 回显的非 OpenAI-compatible provider，是否需要把该策略抽象为 provider capability flag。

## Change Log
- 2026-04-28：新增 `reasoning_content` 回放修复，影响 `packages/ai-core` OpenAI-compatible provider、`myz-annotator` 对话历史重放与工具续轮。
- 2026-04-28：补充 `streamingEnabled` 到 provider 连接测试与 OpenAI-compatible client 组装路径，保证 Settings 中的 Streaming 开关影响实际请求体。
