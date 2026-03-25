# myz-bot 渐进式工具反馈

## Vision
- 让 myz-bot 在需要调用工具处理任务时，不再只在最后一次性返回长总结，而是像真实助手一样按步骤汇报当前动作与阶段结果。

## Scope
- 当 bot 进入工具调用链时，向用户发送自然口吻的前置反馈，说明自己接下来会先看什么、确认什么。
- 当单个工具返回后，向用户发送自然口吻的阶段性结果反馈，说明刚看到的关键信息或下一步。
- 支持普通对话与 scheduler 的 `llm` 任务触发链路。
- 进度消息要写入 Telegram 历史审计，但不进入反思、chronicle 和恢复候选。

## Non-Goals
- 不实现 Telegram 消息编辑或流式 token 级输出。
- 不把工具原始完整结果全部实时推给用户。
- 不让内部 `SelectTools` 之类的元工具暴露给用户。

## Data Model
- `telegram-history.jsonl`
  - 新增 `kind: "progress"`，用于记录工具调用开始 / 完成 / 失败的中间反馈
- 不新增持久化 schema 文件
- 不把进度消息写入 `llm-history.jsonl`

## UX / Flow
- bot 决定调用工具时：
  - 优先直接复用该轮 assistant tool-call 消息里的自然前置说明
  - 若该消息缺失或不适合直接展示，再由单独的轻量提示词生成一句短的自然反馈
- 工具执行结束后：
  - 根据工具结果摘要，再生成一句短的自然反馈
  - 若结果是失败，应明确告知卡住点，但不写成系统报错播报
- 最终 assistant 仍会给出完整收束回复，但不再承担所有过程播报职责。

## Acceptance Criteria
- 至少一个真实工具调用会产生中间进度消息。
- 内部 `SelectTools` 不会向用户暴露。
- 进度消息会写入 `telegram-history.jsonl`，且 `kind` 为 `progress`。
- `conversationReflections`、`chatChronicle`、`contextRecovery` 不会把 `progress` 记录当作正常对话材料使用。
- `npm test`、`npx tsc --noEmit`、`npm run build` 通过。

## Risks / Rollback
- 若工具链很长，可能增加消息数。
- 若结果摘要过长，仍可能造成噪音。
- 回退方式：移除 tool progress notifier 接入点，保留最终总结回复。

## Verification
- `npm test`
- `npx tsc --noEmit`
- `npm run build`

## Status
- Done (2026-03-25)

## Change Log
- 2026-03-25
  - Bot: 新增由 assistant tool-call 内容和轻量提示词共同驱动的渐进式反馈消息。
  - Bot: 进度消息记录为 `telegram-history.jsonl` 的 `progress` kind，但不会进入 reflection / chronicle / recovery。
  - Bot: scheduler 的 `llm` 任务触发链路也支持中间工具进度反馈。
