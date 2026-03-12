# v4-ai-sync-bot 需求与计划

## Vision
- 将 AI + Sync 基础能力抽取为可复用的 Node module，并在此基础上交付可用的 Telegram Bot MVP（支持与用户对话、工作目录隔离、共享记忆、人设驱动）。

## Background / Motivation
- 现有 AI 与 Sync 逻辑集中在 `myz-annotator/src/background/`，依赖 MV3/Chrome API 与 IndexedDB，无法在 Node 环境复用。
- 近期已完成协议/数据结构版本化，需要以“schema-first + 可迁移”的方式将核心能力抽取出来，避免在不同运行时出现模型与协议漂移。
- 目标是建立可在浏览器与 Node 复用的基础模块，并提供一个独立运行的 bot 项目作为首个复用场景。

## Scope
- 抽取 AI 基础能力为 Node module（含 provider、MCP、prompt/normalize、类型与 schemas、运行时组装能力）。
- 抽取 Sync 基础能力为 Node module（含协议、加密、S3 客户端、manifest/chunk/keyring、协议 registry 与 schemas）。
- 为浏览器侧保留适配层（Chrome/IndexedDB/通知/alarms 等）。
- 新建 `myz-bot` Node 项目：
  - Telegram Bot API 接入（基于 `.env` 注入 bot token/username）。
  - 读取 `SOUL.md` 形成 bot 人设。
  - 提供中文 `SOUL.md` 默认模板（专注人设，不重复行为准则）。
  - 会话隔离：`conversations/<conversation-id>/` 目录存放历史与工作文件。
  - 共享记忆：`memory/` 目录可检索与写入。
  - 支持在指定工作目录使用抽取后的 AI workflow/agent。
  - CLI：`serve`/`init`/`check` 三个命令。
- 设计并落地 `bot.yml`（包含 Telegram 与 GenAI 配置、agent 配置、skills 路径）。

## Non-Goals
- 不改动现有扩展 UI 与用户交互流程。
- 不实现“跨版本历史数据迁移器”（仅保证新模块使用当前 schema 版本）。
- 不实现完整的分发与安装体系（保留 npm 发布与单文件构建能力，但不做安装器/GUI）。

## Data Model (schema-first)
- `bot.yml`（新增，zod schema + 类型）：
  - `telegram: { username: string; token: string }`
  - `ai: { provider: "openai_compatible" | "anthropic" | ...; baseUrl?: string; accessToken?: string; headers?: Record<string,string>; model: string; capabilities; limits; tooling }`
  - `mcpServers: Array<{ id?; name; enabled?; url; headers? }>`
  - `workspaceRoot: string`（默认当前工作目录）
  - `conversationsDir: string` / `memoryDir: string`
  - `skillsDir: string`（保留字段，当前不使用）
- `Conversation`（新增，文件系统持久化）：
  - `conversationId: string`（固定为 `chatId + userId` 组合，避免群聊混淆）
  - `metadata.json`：`{ schemaVersion: "1.0.0", user, createdAt, updatedAt, title? }`
  - `history.jsonl`：按行记录消息（`role`, `content`, `timestamp`, `tool_calls?`, `metadata?`）
- `Memory`（新增，文件系统持久化）：
  - `memory/index.json`：记忆索引（标签/时间/来源/embeddingId?）
  - `memory/notes/*.md`：具体记忆条目
- AI/Sync 共享 schema 版本继续沿用 `v3` 已定义规范，抽取时保持 registry 与 schema 位置可被两端引用。

## UX / Flow
- Telegram 用户发送消息 → bot 读取/创建会话目录 → 读取 `SOUL.md` + `bot.yml` → 调用 AI core 生成回复 → 记录历史与记忆 → 返回 Telegram 回复。
- 不同用户会话隔离：按 `conversation-id` 独立目录保存所有工作产物。
- 共享记忆：`memory/` 对所有会话可读写，检索结果注入 prompt。
- CLI：`init` 初始化配置与目录，`check` 验证 Telegram/LLM 连通性。

## Dependencies / Constraints
- 依赖 Node 18+（内置 `fetch` 与 WebCrypto）。
- Telegram Bot 采用 Long Polling。
- 需要明确与现有 `AIProviderSetting`/`Sync*` 类型的映射关系。
- Node 侧需要替换 Chrome/IndexedDB/alarms/notifications 的实现。
- 引入根级 workspace（npm/pnpm）统一管理新 packages。
- 采用 npm workspaces（根级 `package.json`），新增包统一纳入 workspace。

## Acceptance Criteria
- Given 新模块被引用，When 在扩展与 Node 中编译运行，Then 不出现 Chrome/IndexedDB 依赖泄漏到 core 包。
- Given bot 收到消息，When 生成回复，Then 会话目录下新增 `metadata.json` 与 `history.jsonl` 并包含该消息。
- Given `SOUL.md` 存在，When bot 回复，Then prompt 中包含该人设内容。
- Given `bot.yml` 缺失或字段无效，When 启动 bot，Then 进程必须直接报错并给出明确缺失字段。
- Given 连接 LLM 失败，When bot 回复，Then 记录失败原因到会话目录并向用户返回可读错误。

## Verification Plan
- 单元：
  - AI core：provider client、prompt/normalize、tool registry、schema registry。
  - Sync core：加密/解密、manifest/chunk 校验、版本匹配校验。
  - bot config：`bot.yml` zod 校验失败/成功用例。
- 手动：
  - 启动 bot → 向指定 Telegram 用户发送消息 → 检查会话目录文件生成。
  - 切换不同用户 → 确认会话隔离。

## Risks / Rollback
- 风险：抽取过程中引入路径/依赖断裂，导致扩展构建失败。
  - 回退：保持原路径与接口，抽取采用“薄适配层 + 逐步迁移”。
- 风险：Node 环境与浏览器 WebCrypto 行为差异。
  - 回退：为 Node 侧引入兼容层并在测试中固定向量。
- 风险：Telegram 依赖网络环境，CI/本地无法验证。
  - 回退：提供 mock 传输层与本地仿真测试。

## Use Cases / Scenarios
- 主路径：Telegram 用户发送文本 → bot 调用 LLM 回复 → 会话历史记录成功。
- 边界路径 1：`SOUL.md` 缺失 → bot 使用默认模板自动生成。
- 边界路径 2：LLM 返回工具调用但工具未启用 → bot 返回可读错误并记录。
- 失败路径：Telegram API 认证失败 → bot 直接终止并提示 token 错误。

## Boundary Conditions
- 空值/缺失字段：`bot.yml` 缺字段必须启动失败。
- 最大长度/数量：需要为 history 设定上限与压缩策略（复用现有 compaction）。
- 权限不足/不可用：工作目录无写权限时必须启动失败。
- 网络失败/超时：LLM 与 Telegram 请求需有超时与重试策略。
- Guardrail：工具/命令执行必须限制在 `workspaceRoot` 内；允许网络访问与 git；危险操作需显式拒绝或二次确认。
- Skills：当前只读内置技能源 `myz-annotator/src/skills/builtin`。

## Open Questions
- Telegram 的真实验证在本地执行：是否需要提供 mock 传输层以便 CI？

## Status
- Done (2026-03-05)

## Change Log
- 2026-03-05
  - Bot: 新增 `bot-assistant` Agent，System Prompt 改为拟人助理定位并加入“技术细节最小化”约束。
  - Bot: System Prompt 仅在会话首次写入并复用；对话上下文注入用户信息（姓名/username/关系）。
  - Bot: Telegram 发送超长消息自动拆分；支持 HTTP(S) 代理（EnvHttpProxyAgent）。
  - Bot: skills 改为多源（当前仅启用 `myz-annotator/src/skills/builtin`）；根目录 `SOUL.md` 移除，使用 `myz-bot/SOUL.md`。
  - Bot: 新增 Vite 构建产物（单文件 `dist/myz-bot.cjs`）与使用说明文档。
  - Bot: 增加 dist 发布脚本与 npm 发布说明（`dist/package.json` + `bin`）。
  - Bot: 新增 CLI 命令（`serve`/`init`/`check`）与 commander 支持；README/AGENTS 文档更新。
  - Core: ai-core/sync-core 补充类型与路径修复（task types、mcp 路径、settings 类型等）。
