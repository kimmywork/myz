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
- `check -w <workspace>`: 检查 LLM 连通性
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
- TUI 是唯一交互通道，不再支持 Telegram
- 浏览器工具通过 `src/browser/` 模块提供 Playwright 集成
- 知识管理通过 `src/knowledge/` 模块提供 4 层知识架构

## Runtime Layout

每个 workspace 的运行态数据在：

- `~/.myz-bot/workspaces/<workspaceId>/conversations/`
- `~/.myz-bot/workspaces/<workspaceId>/attachments/`
- `~/.myz-bot/workspaces/<workspaceId>/permissions/`
- `~/.myz-bot/workspaces/<workspaceId>/soul/`
- `~/.myz-bot/workspaces/<workspaceId>/system/`

`soul/` 当前只保存 SOUL 草稿、版本与审计文件。

`system/` 当前包含：

- `launch.json`
- `upgrade-state.json`
- `restart-request.json`
- `handoffs/` 升级 handoff 确认文件

## Workspace Layout

workspace 默认只保留协作文档与 skills：

- `AGENTS.md`
- `BOOTSTRAP.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `skills/`
- `knowledge/` — 4 层知识库

初始化生成的 `.gitignore` 只放行这些 Markdown 文档。

## Knowledge System

4 层知识管理架构：

- `knowledge/concepts/` — 概念层：用户信念、价值观、领域心智模型（最低流转）
- `knowledge/structure/` — 结构层：项目架构、技术栈、依赖关系、组织模式
- `knowledge/behavior/` — 行为层：偏好、习惯、沟通风格、决策启发式
- `knowledge/ops/` — 运维层：当前任务、待办、活跃调查、近期发现（最高流转，自动过期）

知识条目存储为 markdown + YAML frontmatter 文件。`knowledge/index.json` 提供快速查找索引。

数据来源：
- MyZRecord 笔记数据（通过 KnowledgeSync 工具从 myz-desktop 的 records.json 同步）
- 对话中的持久知识（通过 Knowledge 工具创建）
- 用户显式请求（"记住这个"）

知识上下文注入：对话开始时，最相关的知识条目会被注入到上下文中。

## Browser Tools

Playwright 浏览器集成（`src/browser/`）：

- `BrowserOpen` — 打开 URL
- `BrowserNavigate` — 导航到新 URL
- `BrowserClick` — 点击元素
- `BrowserType` — 输入文本
- `BrowserScreenshot` — 截图返回 base64
- `BrowserEvaluate` — 执行 JS
- `BrowserContent` — 获取页面内容
- `BrowserClose` — 关闭浏览器

安全约束：仅允许 http/https，阻止 localhost/私有 IP，JS 执行有安全检查。

## Tool Model

- `/workspace` 指向当前 workspace 根目录
- `/attachments` 指向当前会话已保存附件目录，只读
- `Run` 只能把 `/workspace` 映射到真实命令工作区
- `Write` / `Edit` 不允许写 `/attachments`
- runtime 内部文件只允许 bot 自己处理，不作为 agent 常规工具面暴露

## Main Flow

- 默认主聊天链路是 memory-less
- 会话上下文保留 summary-only `context compaction`：必要时压缩 `llm-history.jsonl` 并生成当前会话摘要，但不做恢复上下文、归档历史或自动记忆
- `conversation history` 只保留字面历史
- 复杂任务通过 builtin `planning-mode` + `Task` 工具在主对话中规划和执行
- 长期状态默认写入 `AGENTS.md`、`SOUL.md`、`IDENTITY.md`、`USER.md` 及事实文档
- 在交互式 TTY 中运行 `serve` / `launch` 时，默认显示基于 curses-style pane layout 的 terminal dashboard，并提供本地 chat 输入框
- 可用 `--no-tui` 或环境变量 `MYZ_BOT_TUI=0` 关闭；可用 `--tui` 或 `MYZ_BOT_TUI=1` 强制开启

## Removed Paths

- `context recovery` 已删除
- `conversationReflections`、`chatChronicle`、`growth`、`relationships` 已删除
- `migrate-layout`、`/ops reset-memory`、`/ops housekeeping` 已删除
- 联系人/跨会话转告工具已从默认 agent 能力面删除
- Telegram 集成已完全移除

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
- 默认生成的 `bot.yml` 必须保持精简，只展开必要字段
- 新配置使用 `channels.tui` 结构

## Editing Notes

- 新增行为先改 schema 和状态文件模型，再改 CLI / `/ops` / launcher
- 只用 `apply_patch` 改文件
- 不要恢复用户已有改动
- 如果 `README.md`、此文件与真实行为脱节，必须一起更新
