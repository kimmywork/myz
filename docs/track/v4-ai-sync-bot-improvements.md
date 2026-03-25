# myz-bot 改进计划

## Vision
- 将 myz-bot 发展为稳定、可扩展、可治理的智能助理，支持群聊与多种消息形态，具备标准工具体系、可控的权限边界、可持续的上下文与人设演进能力。

## Goals
- Telegram：支持群聊、多种消息类型（图片/语音/文件/转发/回复线程）。
- 工具与技能：统一标准工具接口 + 多技能加载体系。
- 上下文：对话压缩、摘要、可滚动上下文更新。
- 人设成长：允许 bot 生成/更新 SOUL.md，但需有安全审核与回滚。
- 权限：限定可交互用户/群组/管理员权限。

## Non-Goals
- 不引入图形化管理后台（先保留 CLI + 配置）。
- 不在本阶段实现跨平台安装器。

## Phase Roadmap
### Phase 1: 多类型消息 + 权限控制（M1）
- Telegram
  - 群聊支持（chatId + userId 区分）
  - 支持 `message` / `photo` / `document` / `voice` / `reply_to_message` / `forward_from`
  - 媒体文件可保存到会话目录（开关控制）
- Permissions
  - allowlist 用户/群组
  - admin 用户列表（仅管理员可执行管理命令）
  - 未授权用户友好提示（不触发工具/LLM）
- Deliverables
  - `bot.yml` 新增 `telegram.allowedUsers/allowedChats/adminUsers`
  - 消息路由策略（群聊仅 @bot 或管理员命令响应）
  - 会话目录下新增 `attachments/`（保存媒体）

### Phase 2: 标准工具与技能体系（M2）
- Tools / Skills
  - 统一工具 schema（带来源、权限、审计字段）
  - 多源 skills（builtin + project skills，remote catalog 预留）
  - skills allowlist / denylist
- Deliverables
  - `/skills` 列表可带 source 过滤
  - 工具调用记录与运行时上下文分离存储
  - 可配置的工具开关与权限策略

### Phase 3: 上下文压缩与记忆（M3）
- Context
  - 对话压缩策略（token/窗口阈值触发）
  - 摘要写回 `memory/`，并在系统 prompt 中注入
  - 压缩前后对话一致性校验（保留关键任务状态）
- Deliverables
  - `context.maxHistoryMessages` / `context.compressionThreshold`
  - 压缩任务日志与回滚策略

### Phase 4: SOUL 成长与自我进化（M4）
- SOUL Growth
  - `/soul draft` 生成草案
  - `/soul apply` 需管理员确认
  - 版本化 SOUL（历史可回滚）
- Deliverables
  - `SOUL.md` 版本目录与审计记录
  - 可配置自动草案（默认关闭）

## Data Model Additions
- `bot.yml`
  - `telegram.allowedUsers: string[]`
  - `telegram.allowedChats: number[]`
  - `telegram.adminUsers: string[]`
  - `telegram.saveIncomingMedia: boolean`
  - `telegram.groupResponseMode: { onlyWhenMentioned; allowReplyToBot; allowAdminCommands }`
  - `skills.sources: Array<{ id; dir; readonly }>`
  - `skills.allowlist?: string[]`
  - `tools.allowlist?: string[]`
  - `tools.denylist?: string[]`
  - `context.maxHistoryMessages?: number`
  - `context.compressionThreshold?: number`
  - `soul.autoDraft?: boolean`
  - `soul.autoApply?: boolean`
  - `soul.reviewRequired?: boolean`

## UX / Flow
- 群聊：默认仅响应 @bot 或管理员指令。
- 媒体：图片/文件自动保存到会话目录，引用写入 history。
- 技能：支持 `/skills` 查看，支持 `/skills/<source>/<name>` 读取。
- SOUL：`/soul draft` 生成草案；默认允许自动应用，关闭 `autoApply` 时则改为管理员确认。

## Risks
- 群聊噪音高，需严格响应策略。
- 自动人设更新可能引入不一致或安全风险。
- 过度上下文压缩导致信息丢失。

## Acceptance Criteria
- 群聊中 bot 能识别 @ 指令并只响应目标消息。
- 图片/文件消息可保存并在回复中引用。
- 技能加载可配置，默认包含 builtin + project 两个 source，并支持 allowlist / denylist。
- 本地工具可通过 allowlist / denylist 控制暴露范围。
- 压缩策略在指定阈值触发且不破坏任务连续性。
- SOUL 草案与应用都必须可审计、可回滚；当 `autoApply: false` 时，草案必须人工确认才生效。
- 未授权用户无法触发工具或与 bot 交互。

## Verification
- `npm test`
  - `node --import tsx --test tests/*.test.ts`
- `npx tsc --noEmit`
- `npm run build`

## Status
- Done (2026-03-12)

## Change Log
- 2026-03-12
  - Bot: 新增 Telegram 群聊响应策略、allowlist/admin 校验、未授权友好提示。
  - Bot: 支持图片/文件/语音保存到 `conversations/<id>/attachments/`，并将回复/转发上下文注入消息内容。
  - Bot: 新增 skills/tool allowlist 与 denylist；`/skills` 支持 source 过滤与读取具体技能文件。
  - Bot: 工具调用与结果以结构化消息写入 `history.jsonl`，保留审计字段。
  - Bot: 新增上下文压缩、`memory/conversation-summaries/` 写回、`context/compression-log.jsonl` 记录。
  - Bot: 新增 `/soul draft`、`/soul apply`、`soul/versions`、`soul/drafts` 与 `soul/audit.jsonl`。
  - Bot: `npm test` 脚本切换为 `node --import tsx --test tests/*.test.ts`，补充 config / permissions / context / soul 回归测试。
  - Bot: 会话目录新增独立 `workspace/`，本地工具与命令默认在 `conversations/<id>/workspace` 下运行。
  - Bot: 增加 `conversations/<id>/logs/errors.jsonl` 错误日志；管理员收到完整错误与 stack，普通用户收到简短错误。
  - Bot: Telegram API 与 LLM API 增加指数退避重试配置（`telegram.retry` / `ai.retry`）。
- 2026-03-13
  - Bot: 会话历史拆分为 `telegram-history.jsonl`、`llm-history.jsonl` 与 `llm-trace.jsonl`，Telegram 事实记录与 LLM 运行时上下文不再混存。
  - Bot: growth / relationship / SOUL auto-draft 反思统一改为读取 `telegram-history.jsonl`，并通过 Telegram message id 水位去重，不再依赖可见消息 offset。
  - Bot: 上下文压缩新增字符预算与冷却时间，压缩后会真正重写 `llm-history.jsonl` 并把归档消息写到 `context/archive/`，避免短时间重复压缩。
  - Bot: 工具响应与工具审计迁移到 `llm-trace.jsonl`，不再污染运行时 prompt history，也不会进入压缩摘要。
  - Bot: SOUL 草案生成与应用增加进程级串行化，并把草案创建/应用流水写入 `soul/audit.jsonl`，降低多会话并发覆盖风险。
  - Bot: 新增 `context/chat-chronicle.md` 长期聊天编年摘要，基于 Telegram 增量记录滚动收敛，供后续 prompt 使用。
  - Bot: prompt-visible `SOUL.md` 改为结构化收敛，避免人设文本在长期自动成长中无限膨胀。
  - Bot: `soul/growth-events.jsonl` 与 `relationships/reflections.jsonl` 改为“近期原始流水 + 自动归档”模式，`growth.json` / `relationships/index.json` 保留当前稳定状态层。
  - Bot: 新增 `context/recovered-context.json` 跨层恢复缓存；当运行时历史偏薄时，由 LLM 从 chronicle / summary / growth / relationships / memory / archive 候选中选择相关背景并压缩为可注入上下文。
 - 2026-03-17
  - Bot: 工具虚拟路径语义统一为 `/bot` 与 `/workspace` 两层；`memory/`、`conversations/`、`soul/`、`relationships/`、`permissions/`、`.myz/skills/` 全部视为 `/bot` 下结构。
  - Bot: `bot.yml` 运行时目录配置收敛为 `workspaceRoot` 单点推导，不再要求单独配置 `skillsDir`、`conversationsDir`、`memoryDir`。
  - Bot: 会话目录创建时自动写入 `.gitignore`，默认忽略 `workspace/*`，避免工作区产物污染运行时仓库。
  - Bot: 运行态 `llm-history.jsonl` 在未压缩前保留 tool response，只有 compression 重写历史时才排除 tool response；压缩摘要仍不保留 tool response / tool audit。
  - Bot: growth / relationship / SOUL reflection pass 现在按 `conversationId` 串行，避免消息处理与 scheduler 并发重复结算同一批 Telegram 消息。
  - Bot: 默认反思节奏下调并拉开：growth / relationship 默认更勤，auto-draft 默认更稀疏。
  - Bot: auto-draft 不再把“角色成长状态”与“最近反馈摘要”这类波动段直接沉回基础 `SOUL.md`，降低长期膨胀风险。

## Remaining Work (2026-03-17)
- 恢复层命中策略与候选裁剪优化仍未完成；当前 `context/recovered-context.json` 已存在，但恢复触发仍主要依赖运行时 history 薄度阈值。
- 缺少面向运维的长期状态维护命令；目前 `SOUL.md`、`soul/`、`relationships/`、`context/archive/` 的清理仍主要依赖人工处理，而不是 CLI 子命令。
- 真实运行目录的历史状态迁移仍未系统化；旧的膨胀 `SOUL.md`、过大的 `soul/audit.jsonl`、旧版本目录需要人工收敛，尚未内建一键治理流程。
