# myz-bot 改进计划（Draft）

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
  - 工具调用记录结构化写入 `history.jsonl`
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
  - `skills.sources: Array<{ id; dir; readonly }>`
  - `skills.allowlist?: string[]`
  - `context.maxHistoryMessages?: number`
  - `context.compressionThreshold?: number`
  - `soul.autoDraft?: boolean`
  - `soul.reviewRequired?: boolean`

## UX / Flow
- 群聊：默认仅响应 @bot 或管理员指令。
- 媒体：图片/文件自动保存到会话目录，引用写入 history。
- 技能：支持 `/skills` 查看，支持 `/skills/<source>/<name>` 读取。
- SOUL：`/soul draft` 生成草案，`/soul apply` 需管理员确认。

## Risks
- 群聊噪音高，需严格响应策略。
- 自动人设更新可能引入不一致或安全风险。
- 过度上下文压缩导致信息丢失。

## Acceptance Criteria
- 群聊中 bot 能识别 @ 指令并只响应目标消息。
- 图片/文件消息可保存并在回复中引用。
- 技能加载可配置，默认仅 builtin。
- 压缩策略在指定阈值触发且不破坏任务连续性。
- SOUL 草案必须人工确认才生效。
- 未授权用户无法触发工具或与 bot 交互。

## Status
- Draft (2026-03-05)
