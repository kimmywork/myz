# myz-bot 定时任务计划

## Vision
- 让 myz-bot 成为可持续处理提醒、待办和未来动作的智能助理；任务既能由用户直接要求创建，也能由 bot 在对话中识别后自动创建，并在触发时回到原对话继续工作。

## Scope
- 为每个对话新增结构化定时任务存储。
- 将任务视图同步到 `conversations/<id>/TODO.md`。
- 增加任务工具，支持创建、查询、延期、完成、删除、归档、恢复。
- 增加后台调度轮询，在任务触发时回到原对话发送提醒或调用 LLM 继续处理。
- 增加 `/todo` 兜底命令，用于直接查询和控制当前会话任务。

## Non-Goals
- 不实现周期性任务或复杂 RRULE。
- 不实现跨对话共享任务池。
- 不把 `TODO.md` 作为唯一真源；结构化 `tasks.json` 才是权威状态。

## Data Model
- `bot.yml`
  - `scheduler.enabled: boolean`
  - `scheduler.pollIntervalMs: number`
  - `scheduler.maxBatchSize: number`
  - `scheduler.failureRetryBaseDelayMs: number`
- `conversations/<id>/tasks.json`
  - `tasks[]: { id, title, instructions, dueAt, status, triggerMode, directReply?, triggerAttempts, retryAfter?, lastError? }`
- `conversations/<id>/TODO.md`
  - 从 `tasks.json` 生成的人类可读视图

## UX / Flow
- 用户在当前对话中提出“明天提醒我”“下周再处理这个”等需求时，bot 应优先调用任务工具创建任务。
- 用户查询当前对话任务时，bot 应优先读取任务工具结果或 `TODO.md` 再回答。
- 任务触发后：
  - `direct` 模式：直接向原对话发送提醒文本。
  - `llm` 模式：以“定时任务触发”事件回灌当前对话上下文，由 LLM 继续回复或调用工具。
- 用户也可通过 `/todo` 查看和控制当前会话任务。

## Acceptance Criteria
- 新任务创建后，`tasks.json` 与 `TODO.md` 同步生成。
- 定时任务会记住原 `conversationId`，触发时能回到原 Telegram 对话和线程。
- `llm` 模式触发后会把事件写入 `history.jsonl` 并继续正常生成回复。
- 调度失败会写入 `conversations/<id>/logs/errors.jsonl`，并按退避策略重试。
- 用户可在当前会话通过 `/todo` 或自然语言控制任务状态。

## Risks / Rollback
- 若调度逻辑异常，任务可能重复触发或触发失败。
- 回退方式：关闭 `scheduler.enabled`，保留 `tasks.json` / `TODO.md` 供人工处理。

## Verification
- `npm test`
- `npx tsc --noEmit`
- `npm run build`

## Status
- Done (2026-03-12)

## Change Log
- 2026-03-12
  - Bot: 新增 `tasks.json` + `TODO.md` 会话级任务存储。
  - Bot: 新增 `CreateScheduledTask`、`ListScheduledTasks`、`UpdateScheduledTask` 本地工具。
  - Bot: 新增后台任务调度器，支持 direct / llm 两种触发模式。
  - Bot: 新增 `/todo` 命令用于当前会话任务查询与控制。
