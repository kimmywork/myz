# myz-bot 运维维护能力

## Vision
- 让 myz-bot 具备最小但可用的运维面，便于管理员在 Telegram 内直接查看运行状态、统计 token 用量，并执行可控的维护操作。

## Scope
- 新增管理员命令 `/ops`。
- 支持 `/ops status` 查看基础运行状态与运行时目录概览。
- 支持 `/ops usage [current|all]` 统计 token 用量、回复次数与工具调用次数。
- 支持 `/ops reset-memory [current|all]` 重置共享记忆与会话摘要。
- 支持 `/ops housekeeping [current|all]` 归档并清空会话级 `llm-history.jsonl` / `llm-trace.jsonl`，同时重置恢复缓存。
- 支持 `/ops restart` 请求 bot 在当前命令回复后退出进程。

## Non-Goals
- 不在 bot 内部实现进程自拉起或 supervisor。
- 不删除 Telegram 事实历史 `telegram-history.jsonl`。
- 不删除 `tasks.json`、`TODO.md`、`metadata.json`、SOUL、growth、relationship 稳定状态。
- 不实现任意路径级别的危险清理命令。

## Data Model
- `conversations/<id>/context/archive/`
  - 新增 housekeeping 生成的归档文件：
    - `ops-llm-history-<timestamp>.jsonl`
    - `ops-llm-trace-<timestamp>.jsonl`
- `memory/`
  - `reset-memory all` 会重置 `index.json`，清空 `notes/` 与 `conversation-summaries/`
  - `reset-memory current` 只删除当前会话 summary，并从 `index.json` 中移除 `conversation:<id>` / `auto-memory` 关联项

## UX / Flow
- `/ops status`
  - 返回 pid、uptime、scheduler 是否启用、会话数、共享记忆条目数、待处理权限请求数。
- `/ops usage current`
  - 统计当前会话 live + archive 的 LLM usage。
- `/ops usage all`
  - 统计所有会话 usage，并给出总量与按会话排序的 top 列表。
- `/ops reset-memory current`
  - 清除当前会话 summary 和与当前会话强绑定的记忆索引项。
- `/ops reset-memory all`
  - 清空共享记忆索引、notes、conversation summaries，并保留目录结构。
- `/ops housekeeping current`
  - 将当前会话 live `llm-history.jsonl` / `llm-trace.jsonl` 归档到 `context/archive/` 后清空，同时重置 `recovered-context.json`。
- `/ops housekeeping all`
  - 对全部会话执行同样操作。
- `/ops restart`
  - 先回复“已请求重启”，再让进程退出；若外部有 supervisor，则由外部拉起新进程。

## Acceptance Criteria
- `/ops` 仅管理员可用。
- `/ops usage` 能统计 `Message.metadata.usage` 中的 prompt/completion/total/reasoning tokens。
- housekeeping 后，live `llm-history.jsonl` 与 `llm-trace.jsonl` 为空或不存在，但归档文件存在。
- `reset-memory all` 后 `memory/index.json` 为空数组，`notes/` 与 `conversation-summaries/` 中不再保留旧文件。
- `restart` 不会在回复前直接退出。

## Risks / Rollback
- housekeeping 若误删 live LLM history，短期上下文会变薄。
- `reset-memory all` 会降低 bot 的长期记忆连续性。
- rollback 方式：
  - 不使用 `/ops reset-memory all`
  - 不使用 `/ops housekeeping all`
  - 将 `/ops` 从支持命令中移除

## Verification
- `npm test`
- `npx tsc --noEmit`
- `npm run build`

## Status
- Done (2026-03-25)

## Change Log
- 2026-03-25
  - Bot: 新增管理员 `/ops` 命令，支持 `status`、`usage [current|all]`、`reset-memory [current|all]`、`housekeeping [current|all]`、`restart`。
  - Bot: 新增运维统计与执行模块，支持 token usage 汇总、共享记忆重置、会话级 housekeeping、进程重启请求。
  - Bot: 新增 maintenance 单测，并完成 `npm test`、`npx tsc --noEmit`、`npm run build` 验证。
