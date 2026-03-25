# myz-bot 工具轨迹与进度去重修复

## Vision
- 让 `myz-bot` 在保留工作区约束感知与过程反馈的同时，不再因为重复注入 `AGENTS.md` 和逐条 tool 事件播报而把 prompt、trace 和 Telegram 会话刷成噪音。

## Background / Motivation
- 当前 `Read` / `List` 会把最近的 `AGENTS.md` 正文直接拼进每次工具结果。
- 当目标位于 bot 根目录时，根 `AGENTS.md` 已经进入主 assistant prompt，工具结果再次注入会造成高频重复。
- 当前 progress notifier 会对单个 tool call 与单个 tool result 分别生成中间消息。一个批次里只要有多个工具或多轮工具调用，Telegram 历史就会出现密集、近似重复的“我先看一下”“我刚确认到”类消息。
- 这些重复同时污染 `llm-trace.jsonl` 与 `telegram-history.jsonl`，并增加模型后续回合的噪音输入。

## Scope
- 调整 `Read` / `List` 的 AGENTS 注入策略。
- 保留嵌套目录级 `AGENTS.md` 的传递能力，但不再为 bot 根目录的默认 `AGENTS.md` 反复回灌正文。
- 调整 tool progress 为“按 tool-call 批次”发送，而不是“按单个 tool 事件”发送。
- 增加重复文本折叠，避免同一句被原样重复拼接成一条进度消息。
- 补充测试覆盖根目录 AGENTS 去重、嵌套 AGENTS 保留、tool progress 批次去重。

## Non-Goals
- 不移除 bot assistant system prompt 中对工作区根 `AGENTS.md` 的加载。
- 不改动 `llm-history.jsonl` 与 `llm-trace.jsonl` 的文件格式。
- 不引入 Telegram 消息编辑、撤回或流式更新。
- 不实现跨会话的全局 progress 限流。

## Data Model (schema-first)
- 不新增 schema 文件。
- `llm-trace.jsonl` 继续记录 tool audit，但单条 `content` 预期更短，因为不再重复携带根目录 `AGENTS.md` 正文。
- `telegram-history.jsonl`
  - 继续使用 `kind: "progress"`
  - 单次 tool-call 批次最多追加 1 条开始消息和 1 条结果消息

## UX / Flow
- 当 bot 读取 bot 根目录下的文件或目录时：
  - 不再把根 `AGENTS.md` 正文拼进工具结果
  - 仍直接返回目标文件/目录内容
- 当 bot 读取带有嵌套 `AGENTS.md` 的子目录时：
  - 继续把该嵌套 `AGENTS.md` 附带给模型
- 当一个 assistant tool-call message 包含多个 public tools 时：
  - 只发送 1 条开始进度消息
  - 等这一批 tool result 收齐后，再发送 1 条结果进度消息
- 当 assistant draft 本身出现整段重复时：
  - 自动折叠成单份文本后再发送

## Dependencies / Constraints
- 依赖 `myz-bot/src/tools.ts` 当前的虚拟路径解析与 AGENTS 查找逻辑。
- 依赖 `packages/ai-core/src/providers/capabilities/toolCalling.ts` 按 assistant tool-call message -> 多个 tool result message 的执行顺序。
- 必须兼容普通对话与 scheduler 的相同 notifier 实现。

## Acceptance Criteria
- Given 读取 `/bot/...` 下的普通文件，When 最近的 `AGENTS.md` 是 bot 根目录 `AGENTS.md`，Then 工具结果不包含该根 `AGENTS.md` 正文。
- Given 读取带嵌套 `AGENTS.md` 的子目录或子目录文件，When `Read` / `List` 返回结果，Then 结果仍包含该嵌套 `AGENTS.md` 的提示与正文。
- Given 一个 tool-call 批次内有 2 个 public tools，When 两个 tool result 都返回，Then Telegram progress 只新增 2 条消息：1 条开始、1 条结束。
- Given assistant draft 含有整段重复文本，When 作为 progress 直接复用，Then 最终发送文本只保留一份。
- `node --import tsx --test tests/tools.test.ts tests/toolProgress.test.ts` 通过。

## Verification Plan
- 单元测试：
  - `node --import tsx --test tests/tools.test.ts tests/toolProgress.test.ts`
- 手动验证：
  - 使用 `myz-bot/temp` 现有样本对照，确认根目录 `/bot` 读取不再把完整 `AGENTS.md` 注入 `llm-trace`
  - 触发一个多工具批次，确认 Telegram 中间消息数量明显下降

## Risks / Rollback
- 风险：根目录 AGENTS 从工具结果移除后，若未来某条路径不再经过 system prompt 注入，模型可能少一层提醒。
- 风险：批次级 progress 会减少细粒度可见性。
- 回退：恢复旧的 `withAgentsContext` 与逐 tool 事件 progress 发送逻辑。

## Use Cases / Scenarios
- 主路径：
  - 用户要求 bot 检查 `/bot` 下多个文件，bot 连续调用 `List` / `Read`，最终 trace 不再重复出现整段根 `AGENTS.md`。
- 边界路径 1：
  - 用户读取 `/workspace/repo/file.md`，且 `repo/AGENTS.md` 存在，bot 仍能拿到该子目录规则。
- 边界路径 2：
  - 一个 tool-call batch 内包含多个 public tools，用户只看到一条开始反馈和一条结果反馈。
- 失败路径：
  - tool result 为错误时，结果 progress 仍只发一次，并带错误摘要。

## Boundary Conditions
- 根目录 `AGENTS.md` 缺失
- 读取的目标文件本身就是嵌套 `AGENTS.md`
- 一个 tool-call batch 只有 1 个 public tool
- result summary 为空或超长

## Open Questions
- 暂无

## Change Log
- 2026-03-25
  - 新增去重修复计划，收敛根目录 AGENTS 重复注入与 tool progress 刷屏问题。
  - 预载根目录身份档案到 bot assistant prompt，减少对 `SOUL.md` / `IDENTITY.md` / `USER.md` / `BOOTSTRAP.md` 的重复读取。
