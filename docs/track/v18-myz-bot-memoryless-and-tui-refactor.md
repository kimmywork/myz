# MyZ Bot Memory-less And TUI Refactor

## Status Snapshot

状态时间：2026-04-29

- Phase 1 已完成：主聊天链路默认 memory-less，`prepareConversationContext` 仅保留 summary-only compaction；`recoverContextIfNeeded`、`loadRecoveredContext` 与自动 remember 注入已退出默认主路径。
- Phase 2 已完成：reflection / growth / relationship / chronicle 派生链路已删除，`conversation history` 回归字面历史；手动 `/soul draft` 通过独立生成器保留。
- Phase 3 / 3.5 已完成：Telegram 与本地 TUI 已统一落到共享 chat channel 抽象；`channels.telegram` / `channels.tui` 为当前配置入口；交互式 TTY 下已有 `src/tui/` curses-style dashboard、本地输入、聊天 transcript、鼠标滚轮滚动与安静退出路径。
- Phase 4 核心目标已完成：默认工具面已收敛为 `List`、`Read`、`Write`、`Edit`、`Glob`、`Run`、`Task`、`ListScheduledTasks`、`CreateScheduledTask`、`UpdateScheduledTask`；`Remember` 与联系人消息能力不再处于默认暴露面。
- 当前验证快照：`myz-bot` 包级测试已通过 `121/121`。

## Remaining Closure Items

- 功能级主目标已收口，剩余主要是质量债而不是新的能力缺口。
- `npx tsc -p myz-bot/tsconfig.json --noEmit` 仍未全绿；现存静态错误主要分布在 `src/config.ts`、`src/incoming.ts`、`tests/ai.test.ts` 与 `packages/ai-core`，属于 repo 级类型收口任务。
- TUI 目前已有 focused unit/integration coverage，但仍缺一套真正的终端级交互回归 harness；鼠标、字体、resize、不同 TERM/terminfo 组合仍需以手动验证补足。
- 后续若继续调整 runtime/workspace 规则、TUI 交互或默认工具面，必须优先更新本文件；`v11` 仅作为 runtime/workspace 拆分的历史基线，不应再承载新的主链路决策。

## Vision

`myz-bot` 必须从“依赖运行时记忆、压缩摘要、恢复上下文和自动成长链路”的复杂状态机，收敛成一个更稳定的主对话执行器。

目标形态：

- 主聊天链路默认 memory-less
- 长期状态主要通过 workspace 文档维护，而不是隐藏运行时记忆
- 复杂任务通过内置 `planning-mode` skill + 公共 `Task` 模块完成
- 运行状态通过清晰的终端 UI 暴露，而不是依赖隐式恢复逻辑

## Scope

- 重构 `myz-bot` 主聊天入口，移除默认 memory/recovery/summary 注入
- 简化 bot system prompt，改为围绕 workspace 文档 + builtin skill 协作
- 去掉主链路中的自动 reflection / growth / auto-draft 触发
- 为后续 TUI 预留稳定事件与指标面
- 进一步缩减默认工具面，只保留真正需要的执行能力
- 同步 `AGENTS.md`、track 文档和测试

## Non-Goals

- 不修改 `@myz/ai-core` 中已经抽取完成的公共 planning 核心
- 不重新引入 memory 作为主对话上下文维护机制
- 不在本次重构中扩展新的 provider 类型
- 不为兼容旧的 recovery / reflection 行为保留隐式自动回退
- 不在 Phase 1 和 Phase 2 提前实现完整 TUI 交互式操作面板

## Data Model

### 主对话上下文

- 默认使用当前 conversation 的最近原始消息历史
- 保留 summary-only `context compaction`：当历史超出预算时，压缩运行时历史并生成 `conversationSummary`
- `conversationSummary` 必须通过隐藏上下文消息注入，不允许写回稳定 system prompt
- 不再在主聊天链路自动注入 `recoveredContext`

### 任务规划

- 继续复用 `packages/ai-core/src/tasks/taskManager.ts`
- `myz-bot` 只保留 conversation-local 的 task plan 文件封装
- planning mode 必须作为 builtin skill 被读取和执行，不允许重新复制 planning 规则到 system prompt

### 长期状态来源

- `/workspace/AGENTS.md`
- `/workspace/SOUL.md`
- `/workspace/IDENTITY.md`
- `/workspace/USER.md`
- 其他事实性文档与 skill 文档

### 非主链路保留项

- `/ops usage`、`/ops status`、`/ops restart`、升级相关命令继续保留
- 自动记忆、摘要恢复、反思成长不再参与默认聊天链路

## UX / Flow

### Phase 1: Memory-less Main Flow

1. 用户消息进入会话
2. bot 读取最近历史消息
3. bot 构建稳定 system prompt
4. 若任务复杂，bot 主动读取 `/skills/builtin/planning-mode/SKILL.md`
5. bot 通过 `Task` 工具建立和更新计划
6. bot 直接回复或执行工具，不做自动 memory / recovery / summary 注入

### Phase 2: Reflection / Growth Simplification

1. 移除自动 `processConversationReflectionPass`
2. scheduler 不再在定时任务链路后追加 reflection pass
3. SOUL 草案、成长、关系反思不再作为默认聊天后的后台副作用
4. `conversation history` 仅保留字面历史，不再维护 chronicle / growth / relationship 派生层

### Phase 3: TUI

TUI 必须展示：

- 聊天记录尾部
- 本地 chat 输入框与回显，使 TUI 可作为 Telegram 之外的第二条会话通道
- 当前阶段：`idle | llm | tool | send`
- 请求次数
- 上下文大小估算
- token / seconds
- provider / model / stream 状态
- 当前 history mode 与 context compaction 状态
- 最近一次请求的 prompt/cached/completion/reasoning 明细

TUI 控制要求：

- `serve` 与 `launch` 都必须支持显式 `--tui` / `--no-tui`
- `MYZ_BOT_TUI` 环境变量可作为默认开关
- 非 TTY 场景下不得强制渲染 dashboard
- 交互式 TTY 下的 dashboard 应使用 curses-style pane layout，而不是手写整屏字符串拼接

TUI 必须是被动展示层，不允许反向把复杂状态耦合回主聊天逻辑。

### Phase 3.5: Channel Abstraction

- `TelegramClient` 必须退回 Telegram 专用实现层，不允许继续充当 bot 主流程的公共接口
- bot 主流程必须依赖公共 chat channel 抽象，以便后续接入其他 channel
- bot 主流程必须消费共享 `ChatMessage` / `ChatUser` / `ChatFile` 模型，不允许继续把 Telegram raw message schema 作为主链路事实标准
- `bot.yml` 中的聊天入口配置必须收敛到 `channels.<name>`
- 当未配置 `channels.telegram` 时，默认启用 `channels.tui` 作为本地 chat channel

### Phase 4: Tool Surface Slimming

- 重新评估 `Remember`
- 重新评估联系人发送消息能力的默认暴露级别
- 重新评估与 SOUL 自动演化强绑定的工具或流程

## Dependencies / Boundaries

- `packages/ai-core` 提供公共 planning 核心
- `myz-bot/src/builtinSkills.ts` 负责把 `planning-mode` 打包进单文件构建
- `myz-bot/src/taskPlans.ts` 负责 bot 本地任务计划持久化
- `myz-bot` 不得重新实现第二份 planning 核心
- `planning-mode` 不得通过 system prompt 内联全文，必须作为 skill 文件读取

## Acceptance Criteria

### Phase 1

- 主聊天链路保留 `prepareConversationContext`，但仅用于 summary-only 压缩
- 主聊天链路不再调用 `recoverContextIfNeeded`
- 主聊天链路不再调用 `loadRecoveredContext`
- 主聊天链路不再自动执行 `rememberConversationExchange`
- 默认工具面不再暴露 `Remember`
- system prompt 不再把 `/workspace/memory/MEMORY.md` 作为默认主状态来源

### Phase 2

- 主聊天链路不再调用 `processConversationReflectionPass`
- scheduler 的 LLM 定时任务链路不再调用 `processConversationReflectionPass`
- 聊天完成后不会自动生成 SOUL 草案或成长反馈副作用
- `conversationReflections.ts`、`chatChronicle.ts`、`growth.ts`、`relationships.ts` 已删除
- `bot.yml` 的 `soul` 配置仅保留仍然生效的手动审阅开关，不再保留 auto-draft / growth / relationship 阈值

### Phase 3

- 启动 `myz-bot` 时可看到稳定的 TUI 状态区
- 在交互式 TTY 中可直接通过 TUI 输入消息，并作为本地 channel 进入同一套主聊天链路
- `TelegramClient` 不再是主流程公共接口；公共 channel 抽象可同时承载 Telegram 与 TUI
- 主流程不再直接依赖 `TelegramMessage` / `TelegramUser` / `TelegramFile`；这些 raw 类型只留在 Telegram adapter 层
- `bot.yml` 支持 `channels.telegram` / `channels.tui`，且无 telegram 时默认回落到 TUI
- 至少可显示请求数、阶段、上下文估算、token / seconds、provider/model/stream
- TUI 明确标识当前主链路的 history mode 和 context compaction 状态
- TUI 可通过 CLI 或环境变量显式开关
- TUI 不影响既有消息收发与工具执行正确性
- context compaction 启用时必须明确标识为 `summary-only`
- context compaction 关闭时必须明确标识为 `disabled`

### Phase 4

- 默认工具面只保留高频核心执行能力；当前收敛结果应为 `List`、`Read`、`Write`、`Edit`、`Glob`、`Run`、`Task`、`ListScheduledTasks`、`CreateScheduledTask`、`UpdateScheduledTask`
- `Remember`、联系人消息能力与其他高耦合工具不再属于默认暴露面
- `AGENTS.md` 与实现保持一致

## Risks / Rollback

### Risks

- 历史测试仍依赖 summary/recovery/reflection 旧行为
- 某些长上下文会话在没有压缩/恢复时更容易触达上下文上限
- 旧 prompt 与文档仍可能暗示 bot 会“记住”用户

### Rollback

- 若 memory-less 主链路引起明显退化，只允许按阶段回退对应入口调用
- 不允许在回退时重新引入新的隐式 side effect
- 如需偏离本方案，必须补充 ECN 文档

## Use Cases / Boundary Conditions

### 主路径

- 用户发来复杂开发任务
- bot 识别为复杂任务
- bot 读取 `planning-mode` skill
- bot 通过 `Task` 建立计划并边执行边更新
- bot 在同一主对话内完成规划、执行和收尾

### 边界 1：短问题

- 用户只是问一个简单事实或要一个简短改动
- bot 不应强制创建任务计划
- bot 直接回答或执行即可

### 边界 2：长对话但未读取文档

- workspace 中存在 `SOUL.md` / `USER.md`
- bot 不应假设这些文档已被预读
- 只有在任务相关时才主动读取

### 边界 3：旧 memory 仍然存在

- workspace 里仍然保留 `memory/`
- bot 默认不依赖它构建主对话上下文
- 运维命令仍可继续维护这些文件

### 边界 4：定时任务触发

- 定时任务可以继续触发 LLM 处理
- 但不允许在触发后自动走 reflection/growth 链路

## Change Log

- 2026-04-28: 新建 v18 计划，定义 `myz-bot` memory-less 主流程、reflection 简化、TUI 和工具面瘦身四阶段顺序。
- 2026-04-28: Phase 1/2 已落地到 `myz-bot` 主链路，默认移除 memory/recovery/reflection/contact 能力面，并同步更新 init 模板与 bot 文档。
- 2026-04-29: Phase 3 开始接入被动式 runtime monitor / terminal dashboard，并一度将 context compaction 从默认主路径移除。
- 2026-04-29: Phase 3 补充 TUI 开关、last-request usage 明细和 compaction 状态展示。
- 2026-04-29: 按“不考虑兼容性”的方向，删除 `contextRecovery.ts`、`migrate-layout`、`/ops reset-memory`、`/ops housekeeping`，并将 `context compaction` 重构为 summary-only 版本。
- 2026-04-29: Phase 3 继续增强，TUI 新增本地 chat interface，可作为 Telegram 之外的第二条 channel 复用主聊天链路和 scheduler 回推。
- 2026-04-29: 将 `TelegramClient` 抽取为公共 chat channel 抽象的一个实现，并把 `bot.yml` 聊天入口迁移到 `channels.*`；未配置 Telegram 时默认使用 TUI。
- 2026-04-29: 将主流程中的消息/用户/文件模型进一步抽到共享 `ChatMessage` / `ChatUser` / `ChatFile`，Telegram raw payload 只保留在 adapter 与兼容历史层。
- 2026-04-29: 删除残留 reflection/growth/relationship/chronicle 模块与测试，`conversation history` 回归为纯历史记录；手动 `/soul draft` 改为独立生成器，不再依赖反思链路。
- 2026-04-29: 将手写 ANSI 清屏 dashboard 替换为 `blessed` 驱动的 curses-style TUI，统一状态 pane、聊天 pane 与本地输入框。
- 2026-04-29: 将 `src/terminalUi.ts` 拆分为 shared constants、text formatting 与 widget assembly 模块，并为换行保留、CJK 折行和 ASCII transcript 分隔补充单元测试；同时修正 TUI 高度回退优先读取注入 output 的 `rows`。
- 2026-04-29: 继续细分 TUI 实现并统一迁入 `src/tui/`，新增 `layout`、`history`、`render` 分层；`runtimeMonitor` 改为通过 `src/tui/index.ts` 接入，补充输入历史和布局阈值单测。
- 2026-04-29: 修正 TUI chat newline 丢失问题，`runtimeMonitor` 不再压平 `chatTail` 文本；Conversation pane 改为支持鼠标滚轮后的“手动离底不自动吸底”滚动策略；同时通过 `blessed.program({ extended: false })` 绕开 `xterm-256color` 的 `Setulc` 退出噪音。
- 2026-04-29: 补充状态快照与剩余收口项，明确 Phase 1-4 的当前完成度；将后续工作收敛为 repo 级 typecheck 与 TUI 终端级验证，而非新增主功能。
