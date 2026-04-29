# myz-bot Agent Guide

## Build

- Entry: `src/cli.ts`
- Bundle: `vite build` -> `dist/myz-bot.cjs`
- Dist prep: `scripts/prepare-dist.mjs` writes `dist/package.json` and copies `README.md`
- 发布形态仍然是单文件入口，`launch` 和 `serve` 都来自同一个 `myz-bot.cjs`

## Commands

- `serve -w <workspace> [--tui|--no-tui]`: 直接启动 worker
- `launch -w <workspace> [--tui|--no-tui]`: 启动内置 launcher supervisor
- `init -w <workspace>`: 交互生成 runtime `bot.yml` 和 workspace Markdown 模板
- `check -w <workspace>`: 检查 Telegram + LLM 连通性
- `upgrade [status|check|apply] -w <workspace>`: 查询或申请升级
- `test`: `node --import tsx --test tests/*.test.ts`

## Architecture

- runtime 固定在 `~/.myz-bot`
- `bot.yml` 固定在 `~/.myz-bot/bot.yml`
- workspace 默认为 `process.cwd()`，也可以由 `-w` 显式指定
- `bot.yml.workspaceRoot` 已废弃，代码必须忽略它
- terminal dashboard/TUI 相关模块统一放在 `src/tui/`；优先把 formatting、layout、input history、widget assembly 与 screen lifecycle 分开维护
- agent 只能默认读取 workspace 和当前会话附件，不允许直读 runtime
- 不再暴露 `/bot` 虚拟目录
- AI provider 只允许：`openai_compatible`、`openai_responses`、`gemini`、`anthropic`、`mistral`
- `openai_compatible` 必须通过 `compatProfile` 区分 Tier 1 / Tier 2 供应商，不允许再把 DeepSeek / Moonshot / GLM / Qwen 等做成独立 provider type
- LLM 请求统一通过 `@myz/ai-core/runtime/providerSession`，不要在 `myz-bot` 里重新实现 provider transport
- builtin skills 以单文件资源方式内联进 `myz-bot` 构建产物；当前只内置 `planning-mode`
- `bot.yml` 中的聊天入口统一放在 `channels.*` 下；当前内建 `channels.telegram` 和 `channels.tui`
- 当未配置 `channels.telegram` 时，worker 必须默认退回本地 `channels.tui` 作为唯一 chat channel

## Runtime Layout

每个 workspace 的运行态数据在：

- `~/.myz-bot/workspaces/<workspaceId>/conversations/`
- `~/.myz-bot/workspaces/<workspaceId>/attachments/`
- `~/.myz-bot/workspaces/<workspaceId>/permissions/`
- `~/.myz-bot/workspaces/<workspaceId>/soul/`
- `~/.myz-bot/workspaces/<workspaceId>/system/`

`soul/` 当前只保存 SOUL 草稿、版本与审计文件；不再保存 growth / relationship / chronicle 一类派生状态。

`system/` 当前包含：

- `launch.json`
- `upgrade-state.json`
- `restart-request.json`
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

workspace 默认只保留协作文档与 skills：

- `AGENTS.md`
- `BOOTSTRAP.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `skills/`

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

## Main Flow

- 默认主聊天链路是 memory-less
- 会话上下文保留 summary-only `context compaction`：必要时压缩 `llm-history.jsonl` 并生成当前会话摘要，但不做恢复上下文、归档历史或自动记忆
- `conversation history` 只保留字面历史，不再在后台派生 reflection、growth、relationship 或 chronicle 状态
- 复杂任务通过 builtin `planning-mode` + `Task` 工具在主对话中规划和执行
- 长期状态默认写入 `AGENTS.md`、`SOUL.md`、`IDENTITY.md`、`USER.md` 及事实文档
- 在交互式 TTY 中运行 `serve` / `launch` 时，默认显示基于 curses-style pane layout 的 terminal dashboard，并提供本地 chat 输入框；该 TUI channel 与 Telegram 一样复用主聊天链路、工具调用和 scheduler 回推
- 核心运行时依赖公共 chat channel 接口；Telegram 只是其中一个实现，不允许再把 `TelegramClient` 当作 bot 主流程的默认抽象
- 主流程统一消费共享 `ChatMessage` / `ChatUser` / `ChatFile` 模型；Telegram raw payload 只允许留在 adapter 边界和少量历史兼容层
- 可用 `--no-tui` 或环境变量 `MYZ_BOT_TUI=0` 关闭；可用 `--tui` 或 `MYZ_BOT_TUI=1` 强制开启

## Removed Paths

- `context recovery` 已删除
- `conversationReflections`、`chatChronicle`、`growth`、`relationships` 已删除
- `migrate-layout`、`/ops reset-memory`、`/ops housekeeping` 已删除
- 联系人/跨会话转告工具已从默认 agent 能力面删除

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
- `/ops upgrade [status|check|apply]`
- `/ops restart`

非 launcher 模式下，`upgrade apply` 必须拒绝并明确提示切换到 `launch -w ...`。

## Init And Migration

- `init` 必须优先保护已有 `~/.myz-bot/bot.yml`
- 如果检测到已有配置，非交互模式下必须显式指定 `reuse` 或 `update`
- 默认生成的 `bot.yml` 必须保持精简，只展开必要字段；兼容性/调试/高级 provider 选项只在用户明确需要时再写入
- 新配置必须写成 `channels.telegram` / `channels.tui` 结构，不要再新增顶层 `telegram:` 段

## Editing Notes

- 新增行为先改 schema 和状态文件模型，再改 CLI / `/ops` / launcher
- 只用 `apply_patch` 改文件
- 不要恢复用户已有改动
- 如果 `README.md`、此文件、`docs/track/v11...`、`docs/track/v12...` 与真实行为脱节，必须一起更新
