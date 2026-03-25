# myz-bot 工作区 AGENTS / BOOTSTRAP 模板

## Vision
- 让 `myz-bot` 初始化出来的新工作区，默认就带有适配本系统的 `AGENTS.md` 与 `BOOTSTRAP.md`，而不是只提供 `SOUL.md` 和运行目录。

## Scope
- `init` 命令默认生成 `AGENTS.md`
- `init` 命令默认生成 `BOOTSTRAP.md`
- bot 在启动某个工作区时，默认读取该工作区最近的 `AGENTS.md` 并注入主 assistant 的 system prompt
- bot 通过目录型工具访问目录或文件时，默认检查目标目录最近的 `AGENTS.md` 并一并返回
- 模板内容参考 OpenClaw 的 `AGENTS` / `BOOTSTRAP` 结构，但改写为符合 `myz-bot` 的 Telegram、SOUL、memory、scheduler、permit、ops 设计
- 不覆盖用户已存在的同名文件

## Non-Goals
- 不在本次引入完整的 `IDENTITY.md`、`USER.md`、`TOOLS.md`、`MEMORY.md`、`HEARTBEAT.md` 初始化模板
- 不把 `SOUL.md` 再作为整段固定 system prompt 注入

## UX / Flow
- 新用户执行 `npx myz-bot -- init` 后，除了 `bot.yml` / `SOUL.md` 外，还会得到：
  - `AGENTS.md`：长期工作区约定，覆盖启动、记忆、群聊、任务、工具、维护与边界
  - `BOOTSTRAP.md`：首次建立身份与用户关系的引导，完成后应删除

## Acceptance Criteria
- `initWorkspace` 在空目录里会创建 `AGENTS.md` 和 `BOOTSTRAP.md`
- 若用户已自定义这两个文件，`initWorkspace` 不覆盖
- 当工作区存在 `AGENTS.md` 时，主 assistant prompt 默认包含其内容
- 当 `List` / `Read` 命中某个目录时，返回结果包含该目录最近的 `AGENTS.md`
- README 与仓库说明同步反映新的初始化产物
- `npm test`、`npx tsc --noEmit`、`npm run build` 通过

## Verification
- `node --import tsx --test tests/init.test.ts`
- `npm test`
- `npx tsc --noEmit`
- `npm run build`

## Status
- Done (2026-03-25)
