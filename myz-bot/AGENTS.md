# myz-bot Agent Guide

## Build

- Entry: `src/cli.ts`
- Bundle: `vite build` -> `dist/myz-bot.cjs`
- Dist prep: `scripts/prepare-dist.mjs` writes `dist/package.json` and copies `README.md`
- 发布形态仍然是单文件入口，`launch` 和 `serve` 都来自同一个 `myz-bot.cjs`

## Commands

- `serve -w <workspace>`: 直接启动 worker
- `launch -w <workspace>`: 启动内置 launcher supervisor
- `init -w <workspace>`: 交互生成 runtime `bot.yml` 和 workspace Markdown 模板
- `check -w <workspace>`: 检查 Telegram + LLM 连通性
- `upgrade [status|check|apply] -w <workspace>`: 查询或申请升级
- `migrate-layout -w <workspace>`: 迁移旧布局
- `test`: `node --import tsx --test tests/*.test.ts`

## Architecture

- runtime 固定在 `~/.myz-bot`
- `bot.yml` 固定在 `~/.myz-bot/bot.yml`
- workspace 默认为 `process.cwd()`，也可以由 `-w` 显式指定
- `bot.yml.workspaceRoot` 已废弃，代码必须忽略它
- agent 只能默认读取 workspace 和当前会话附件，不允许直读 runtime
- 不再暴露 `/bot` 虚拟目录

## Runtime Layout

每个 workspace 的运行态数据在：

- `~/.myz-bot/workspaces/<workspaceId>/conversations/`
- `~/.myz-bot/workspaces/<workspaceId>/permissions/`
- `~/.myz-bot/workspaces/<workspaceId>/relationships/`
- `~/.myz-bot/workspaces/<workspaceId>/soul/`
- `~/.myz-bot/workspaces/<workspaceId>/system/`

`system/` 当前包含：

- `launch.json`
- `upgrade-state.json`
- `restart-request.json`
- `layout-migration.json`
- `handoffs/` 升级 handoff 确认文件

`launch.json` 记录 launcher 模式、workspace、命令参数、当前版本、重启次数和最近错误。

`upgrade-state.json` 记录：

- 当前版本
- 当前启动模式
- 上次检查时间
- 最近已知版本
- pendingVersion
- 升级状态
- 最近错误

## Workspace Layout

workspace 只保留协作文件和长期记忆：

- `AGENTS.md`
- `BOOTSTRAP.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `memory/MEMORY.md`
- `memory/YYYY-MM-DD.md`

初始化生成的 `.gitignore` 只放行这些 Markdown 文档。

## Tool Model

- `/workspace` 指向当前 workspace 根目录
- `/attachments` 指向当前会话已保存附件目录，只读
- `Run` 只能把 `/workspace` 映射到真实命令工作区
- `Write` / `Edit` 不允许写 `/attachments`
- runtime 内部文件只允许 bot 自己处理，不作为 agent 常规工具面暴露
- Telegram UX 状态不记入 history：
  - `sendChatAction` 用来表示 LLM / 工具执行中的忙碌态
  - `setMessageReaction` 用来给源消息打 `👌` / `👎` 结果标记

## Memory

- 长期记忆：`memory/MEMORY.md`
- 每日日志：`memory/YYYY-MM-DD.md`
- `Remember` 和对话摘要都落到日期文档
- 首次访问 `memory/` 时会自动迁移旧版 `index.json` / `notes/` / `conversation-summaries/`
- `/ops reset-memory [current|all] [journal|full]`
  - `journal` 只清日记
  - `full` 额外清 `MEMORY.md`

## Launch And Upgrade

- 推荐生产命令只有 `launch -w <workspace>`
- `serve` 裸跑只适合开发或短时会话
- launcher 会监听 `restart-request.json`
- 外部 CLI 写入升级请求时，launcher 会主动结束旧 worker 再接管重启
- 如果请求里包含更高的 `targetVersion`，launcher 会执行：
  - `npx -y <package>@<version> launch -w <workspace> --handoff <token>`
- 新 launcher 在成功拉起 worker 后写入 handoff ack，旧 launcher 再退出

## Ops Surface

管理员命令：

- `/ops status`
- `/ops usage [current|all]`
- `/ops reset-memory [current|all] [journal|full]`
- `/ops housekeeping [current|all]`
- `/ops upgrade [status|check|apply]`
- `/ops restart`

非 launcher 模式下，`upgrade apply` 必须拒绝并明确提示切换到 `launch -w ...`。

## Init And Migration

- `init` 必须优先保护已有 `~/.myz-bot/bot.yml`
- 如果检测到已有配置，非交互模式下必须显式指定 `reuse` 或 `update`
- `migrate-layout` 负责把旧版 runtime 文件从 workspace 根迁入 `~/.myz-bot/workspaces/<workspaceId>/`
- memory 迁移由 `ensureMemoryDir()` 自动处理

## Editing Notes

- 新增行为先改 schema 和状态文件模型，再改 CLI / `/ops` / launcher
- 只用 `apply_patch` 改文件
- 不要恢复用户已有改动
- 如果 `README.md`、此文件、`docs/track/v11...`、`docs/track/v12...` 与真实行为脱节，必须一起更新
