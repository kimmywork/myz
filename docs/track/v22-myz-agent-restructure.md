# v22 myz-agent: 从 myz-bot 到多包 agent 架构

## Vision / 背景动机

`myz-bot` 当前是一个单 package 的 TUI agent，存在以下核心问题：

1. **无真正的 Agent Loop** — `generateReply()` 是单次 LLM 调用，无法自主完成多步任务
2. **blessed 依赖已死** — 构建需要 octal escape 插件修补，无法长期维护
3. **配置系统耦合** — 全局/工作区配置边界不清，不支持多 provider/model
4. **无 Subagent** — 所有工作在单一上下文中完成，无法并行化
5. **无 Permissions 引擎** — 缺少细粒度的 per-agent 工具权限控制
6. **Memory/Knowledge 系统过度设计** — 与 agent 核心无关，增加维护负担

目标：重构为类似 pi 的多包架构，核心小巧、扩展丰富、兼容国产模型。

## Scope

### In Scope

- 重命名 `myz-bot` → `myz-agent`
- 创建 `@myz/agent-core` package（agent loop + extension API + permissions engine）
- 创建 `@myz/agent-providers` package（LLM client 抽象，5 provider adapters，从 ai-core 独立重写）
- 创建 `@myz/agent-tui` package（Ink-based TUI）
- 重写配置系统（`myz.yml`，multi-provider/model，目录分离）
- 实现 agent 定义系统（`.agents/agents/*.md`）
- 实现 permissions engine（glob matching, per-agent override）
- 实现 rules 系统（global/project/skill 三层合并）
- 实现 slash commands（/help /clear /agents /model /fork /resume /tools /context /compact）
- 实现 subagent 系统（explore/general/plan）
- 实现 context compaction（summary + recent window 默认策略）
- 重写所有 system prompt（按 agent mode 分化）

### Non-Goals

- 不实现 MCP server（将 agent 工具暴露为 MCP server）— 留到 v23
- 不实现 LSP 集成
- 不实现 Cost tracking
- 不实现 Undo/Redo
- 不实现 Deterministic hooks（pre/post tool call scripting）
- 不重写 Browser tools 的内部实现（保留现有 Playwright 集成）
- 不重写 `@myz/ai-core`（已由 `@myz/agent-providers` 独立替代，不再依赖）

## Data Model

### 配置文件 Schema

#### `~/.myz/myz.yml` (全局)

```yaml
providers:
  <provider-id>:
    type: "openai_compatible" | "openai_responses" | "gemini" | "anthropic" | "mistral"
    baseUrl: string
    apiKey: string (支持 ${ENV_VAR} 引用)
    compatProfile?: string (仅 openai_compatible)
    models:
      - id: string
        contextWindow: number
        maxOutputTokens: number
        capabilities:
          toolCalling: boolean
          reasoning: boolean
          vision: boolean
defaults:
  provider: string
  model: string
```

#### `<workspace>/.agents/myz.yml` (工作区)

```yaml
defaults:
  provider: string (覆盖全局)
  model: string (覆盖全局)
permissions:
  - pattern: string (glob)
    action: "allow" | "ask" | "deny"
skills:
  allowlist: string[]
  denylist: string[]
browser:
  enabled: boolean
  headless: boolean
context:
  strategy: "summary" | "token-budget" | "none"
  summaryThresholdRatio: number
  recentWindowRatio: number
  summaryMaxTokens: number
```

#### `<workspace>/.agents/myz/mcp.yml`

```yaml
servers:
  <server-id>:
    type: "local" | "remote"
    command?: string[]
    url?: string
    enabled: boolean
    headers?: Record<string, string>
    environment?: Record<string, string>
```

#### `<workspace>/.agents/agents/*.md`

```yaml
---
description: string
mode: "primary" | "subagent"
model?: string (覆盖 defaults.model)
permissions?: PermissionRule[]
hidden?: boolean
maxSteps?: number
---
<system prompt body>
```

### Permission Rule

```typescript
interface PermissionRule {
  pattern: string  // "bash" | "edit" | "bash:git push*" | "mcp_github_*"
  action: "allow" | "ask" | "deny"
}
```

匹配规则：
- Last-match-wins（最后匹配的规则生效）
- 支持 glob pattern (`*`, `?`)
- 支持 compound key (`bash:git push` 匹配 `bash:git *`)
- per-agent override 覆盖全局规则

### Agent Definition

```typescript
interface AgentDefinition {
  id: string
  description: string
  mode: "primary" | "subagent"
  model?: string
  provider?: string
  permissions: PermissionRule[]
  prompt: string
  hidden?: boolean
  maxSteps?: number
}
```

### Context Compaction Strategy

```typescript
interface ContextCompactionResult {
  history: Message[]
  summary: string
  compressed: boolean
  tokenUsage: { total: number; overhead: number; recent: number; summary: number }
}
```

三种策略：
1. `summary` (默认): 旧消息 → LLM 摘要 + recent window 完整保留
2. `token-budget`: 旧消息直接丢弃 + recent window 完整保留
3. `none`: 不压缩

### Slash Command

```typescript
interface CommandDefinition {
  name: string
  description: string
  args?: { name: string; description: string; required: boolean }[]
  handler: (args: string[], context: CommandContext) => Promise<string | null>
}
```

## UX / 流程

### 启动流程

```
myz-agent [-w <workspace>]
  1. 加载 ~/.myz/myz.yml (全局配置)
  2. 加载 <workspace>/.agents/myz.yml (工作区配置, 覆盖全局)
  3. 扫描 <workspace>/.agents/agents/*.md (加载 agent 定义)
  4. 跳过 MCP server 加载（v22 Non-Goal；`.agents/myz/mcp.yml` 预留到 v23）
  5. 加载 <workspace>/.agents/skills/ (加载 skills；v22 为配置/提示层能力)
  6. 注册内置 tools (List, Read, Write, Edit, Glob, Run, Task)
  7. 启动 agent loop + TUI
```

### Agent Loop 流程

```
用户输入
  → 解析 slash command → 执行命令 → 返回结果
  → 否则:
    1. 构建 messages (system + summary + history + user)
    2. 调用 LLM (streaming)
    3. 如果 LLM 返回 tool_calls:
       a. 检查 permissions
       b. 执行 tool
       c. 将 tool result 追加到 messages
       d. 回到步骤 2
    4. 如果 LLM 返回 text content:
       → 显示给用户
       → 追加到历史
```

### /model 选择流程

```
/model
  → 显示当前模型
  → 列出所有已注册模型 (从 ~/.myz/myz.yml 的 providers)
  → 用户输入编号或 provider/model ID
  → 切换当前会话的 model
  → 确认切换
```

### Context Compaction 流程 (summary 策略)

```
每次 LLM 调用前:
  1. 计算 overhead (system prompt + tools 描述的 token)
  2. budget = contextWindow - overhead - maxOutputTokens
  3. 从最新消息往前累加 token
  4. recent window = 最近 budget * recentWindowRatio 的消息 (完整保留)
  5. old messages = 超出 recent window 的消息
  6. 如果 old messages 的 token > budget * (1 - recentWindowRatio):
     → 将 old messages 发给 LLM 生成摘要
     → 摘要作为 user message 插入历史开头
       metadata: { type: "context_summary", hiddenFromHistory: true }
  7. 原始 JSONL 历史不修改
```

## 依赖与边界

### 新 Package 依赖

```
@myz/agent-providers (独立，无旧依赖)
  ↓
@myz/agent-core (agent loop + extensions + permissions)
  ↓
@myz/agent-tui (新建, 依赖 ink + react)
  ↓
myz-agent (重命名自 myz-bot, CLI 入口)
```

### @myz/agent-providers (独立替代 ai-core)

- 从零重写，不复制 ai-core 代码
- 只保留 agent 需要的最小类型和接口
- 5 provider adapters: openai_compatible, openai_responses, anthropic, gemini, mistral
- `createLLMClient(config)` 工厂函数，按 provider type 创建对应 adapter
- `LLMClient` 接口: `complete(request) → { content, toolCalls, usage }`
- 国产模型 profile 支持: deepseek, moonshot, glm, qwen, minimax, longcat, mimo

### 外部依赖

| Package | 用途 | 版本 |
|---|---|---|
| ink | TUI 渲染 | ^7.0.0 |
| react | Ink peer dep | ^18.0.0 |
| commander | CLI 解析 | ^14.0.0 |
| zod | Schema 验证 | ^4.2.0 |
| yaml | 配置解析 | ^2.6.0 |
| dotenv | 环境变量 | ^16.4.0 |
| playwright-core | Browser tools | ^1.56.0 |

### 移除的依赖

| Package | 原因 |
|---|---|
| blessed | 已死，Ink 替代 |

## 验收标准

### Phase 1: 重命名 + agent-core 骨架

- [x] `myz-bot/` 目录重命名为 `myz-agent/`
- [x] `package.json` name 为 `"myz-agent"`
- [x] `~/.myz-bot/` 引用全部改为 `~/.myz/`
- [x] `bot.yml` 引用全部改为 `myz.yml`
- [x] `@myz/agent-core` package 创建，包含 `src/loop.ts`
- [x] `@myz/agent-providers` package 创建（5 provider adapters, LLMClient 接口, 从零重写）
- [x] agent loop 实现：LLM → tool call → result → LLM 迭代循环
- [x] agent loop 支持 streaming
- [x] agent loop 支持 maxSteps 限制
- [x] `src/extensions.ts` 实现 registerTool / registerHook / registerAgent / registerPrompt
- [x] `src/permissions.ts` 实现 glob pattern matching
- [x] `src/permissions.ts` 支持 per-agent override
- [x] `src/permissions.ts` 支持 compound key (`bash:git push*`)
- [x] 所有现有测试通过 (85/85)
- [x] 构建成功 (`vite build`)
- [x] agent-core 7/7 tests pass
- [x] agent-providers type-check clean

### Phase 2: 配置 + Rules + Commands

- [x] `src/config.ts` 实现 multi-provider/model registry
- [x] 全局配置 `~/.myz/myz.yml` 加载
- [x] 工作区配置 `<workspace>/.agents/myz.yml` 加载 + 覆盖
- [x] 配置支持 `${ENV_VAR}` 引用
- [x] `src/rules.ts` 实现三层合并 (global/project/skill)
- [x] `src/commands.ts` 实现 9 个 slash commands
- [x] `/model` 支持列出所有可用模型供选择
- [x] `/agents` 支持列出和切换 agent
- [x] Agent definition 从 `.agents/agents/*.md` 加载
- [x] Agent definition 支持 model override
- [x] 向后兼容旧 config 格式 (ai.* / bot.yml)
- [x] 所有现有测试通过 (87/87)
- [x] 构建成功

### Phase 3: Subagent + Context

- [x] Subagent spawning 机制
- [x] explore subagent (只读, hidden)
- [x] general subagent (全工具)
- [x] plan subagent (只读, 可指定不同 model)
- [x] Task 工具 (primary agent 调用 subagent)
- [x] Context compaction: summary 策略 (默认)
- [x] Context compaction: token-budget 策略
- [x] Context compaction: none 策略
- [x] 摘要作为 user message 插入 (不在 system message 中)
- [x] JSONL 历史不被修改
- [x] 所有现有测试通过 (90/90)

### Phase 4: TUI (Ink) — 三层结构重写

**设计原则**：纯三层纵向布局，无 sidebar。

**层 1: 对话历史** (Static, 不重绘)
- 用户消息 `[YOU]`
- Assistant 消息 `[AI]` — **Markdown 渲染**（bold/code/list 等）
- Tool Use 提示 `▸ ToolName` — 折叠状态，可展开查看请求参数和结果
- Reasoning 摘要 `[思考...]` — 折叠状态，可展开查看完整推理
- Subagent 状态 — Future: v23 subagent event surfacing 后显示 start/progress/result
- 用 `<Static>` 组件渲染 complete entries；pending entries 留在 live 区域；历史滚动交给 terminal scrollback

**层 2: 输入框** (光标跟随, 自动扩展)
- 自研 `InputBar` — 方向键在文本内导航，支持多行 soft wrap 和 pasted hard newline
- Slash command 自动完成 — Future: 当前 slash commands 可执行但没有候选 UI
- `@` 文件引用自动完成 — Future
- 光标/IME buffer 必须跟随输入状态

**层 3: 底部状态栏**
- 工作区 | 模型 | context token 用量 | 当前 agent | 版本号

**验收标准**：
- [x] Assistant 输出正确渲染 Markdown（bold, code, list, heading）
- [x] Tool Use 已按 runtime event 映射为独立 TUI entry，并按事件顺序显示调用与结果
- [ ] Tool Use 可聚焦折叠/展开交互正常（Future: 需要 keyboard focus/action model；当前支持 `expanded` 渲染态但无运行时交互）
- [x] Reasoning stream 已独立落入 TUI history entry，完成后显示摘要并保留 detail
- [ ] Reasoning 可聚焦折叠/展开交互正常（Future: 同 Tool Use，需要统一 transcript action model）
- [x] Transcript 按 user/reasoning/assistant/tool event chronology 渲染，不再按功能分组
- [x] Transcript complete entries 使用 terminal 原生 scrollback，pending entries 留在 live 区域
- [x] 新消息 append 后停留在 prompt 上方，不被空 live frame 推到屏幕外
- [x] 输入框方向键导航正常（left/right + 多行 up/down）
- [x] IME 输入光标位置正确（见 `docs/knowledges/agent-tui-ink-input-cursor-lessons.md`）
- [x] 底部状态栏信息实时更新（model/context token/agent/version）
- [x] Session 历史持久化到 JSONL

### Deferred: MCP (v23)

MCP 在本 PRD 的 Non-Goals 中已明确延期到 v23。原 Phase 5 条目不作为 v22 验收项，保留为 v23 输入：

- [ ] MCP 配置从 `.agents/myz/mcp.yml` 加载
- [ ] MCP server 连接和工具注册
- [ ] MCP per-agent 工具启用/禁用

## 风险与回退方案

| 风险 | 影响 | 缓解 |
|---|---|---|
| Ink TUI 重写工作量大 | 高 | Phase 1-3 不依赖 TUI，可先用 blessed + 插件方案过渡 |
| 移除 knowledge/memory 后用户需要 | 中 | 通过 AGENTS.md + skills + MCP extension 补回 |
| Summary compaction 的 LLM 调用增加延迟 | 低 | token-budget 策略作为 fallback |
| 多包架构增加构建复杂度 | 低 | Vite workspace 支持 monorepo |

## 用例与边界条件

### 用例 1: 主路径 — 用户与 build agent 交互

- 角色：开发者
- 前置条件：`~/.myz/myz.yml` 已配置 provider/model
- 触发：运行 `myz-agent -w /path/to/project`
- 步骤：
  1. Agent 启动，加载配置
  2. 用户输入 "帮我重构 src/tools.ts"
  3. Agent 读取文件，分析结构
  4. Agent 执行 Edit 工具修改文件
  5. Agent 运行 lint 验证
  6. Agent 报告完成
- 预期：文件被正确修改，lint 通过

### 用例 2: 边界 — context window 溢出

- 角色：开发者
- 前置条件：长对话，历史超出 contextWindow
- 触发：用户继续输入
- 步骤：
  1. Agent 检测到 token 超出 budget
  2. 将旧消息发给 LLM 生成摘要
  3. 摘要插入历史开头
  4. 继续处理用户输入
- 预期：对话继续，不丢失关键上下文

### 用例 3: 边界 — 权限拒绝

- 触发：agent 尝试执行 `rm -rf node_modules`
- 步骤：
  1. Permissions engine 匹配 `bash:rm *` → deny
  2. 拒绝执行，返回错误信息
- 预期：命令不执行，用户看到拒绝原因

### 用例 4: 边界 — Subagent 调用

- 触发：build agent 遇到需要大量搜索的任务
- 步骤：
  1. Build agent 通过 Task 工具调用 explore subagent
  2. Explore subagent 在独立会话中搜索
  3. 返回搜索结果摘要
  4. Build agent 继续处理
- 预期：搜索结果正确返回，主 agent 继续工作

## Implementation Status (2026-06-22)

| Area | v22 状态 | 已落地证据 | 剩余事项 |
|---|---|---|---|
| 多包架构 | Done | `packages/agent-core`, `packages/agent-providers`, `packages/agent-tui`, `myz-agent` | 无 v22 阻塞 |
| Provider/runtime | Done | multi-provider config、runtime `/model` 切换、token status、streaming client | provider 质量与模型 profile 继续按实际模型补齐 |
| Reactive agent loop | Done | `runAgentLoop()` 支持 LLM → tool call → tool result → LLM 迭代、maxSteps、stream event | 高级 workflow 状态机进入 v23，不计入 v22 Done |
| Slash commands | Done | `/help` `/clear` `/agents` `/model` `/fork` `/resume` `/tools` `/context` `/compact` 已有 runtime handler/tests | `/fork` `/resume` 仍是最小会话能力，完整 checkpoint/resume 进入 v23 |
| Permissions engine | Partial | glob、compound key、per-agent override 已实现 | `ask` 目前仅作为匹配结果存在，缺少 TUI interactive approval；工具名大小写/canonical mapping 需统一 |
| Subagent | Partial | builtin `explore/general/plan`、Task 工具、`spawnSubagent()` 已实现 | subagent 目前没有复用主 runtime 工具执行链，tool call 返回受限占位；事件回传/权限/预算隔离进入 v23 |
| Context compaction | Done | summary/token-budget/none 策略、手动 `/compact`、JSONL history 不被原地改写 | 摘要质量评测与 checkpoint 结合进入 v23 |
| TUI transcript | Done | chronological entries、terminal native scrollback、pending/live split、Markdown/status tests | Tool/Reasoning 的 keyboard focus + toggle 进入 v23 |
| InputBar / StatusBar | Done | 多行输入、硬换行、IME cursor、状态栏 one-line truncation、lesson learned | 无 v22 阻塞 |
| MCP | Deferred | Non-Goal 已明确 | v23 重新立项 |

**v22 结论**：v22 已完成“可用的多包 agent runtime + 稳定 Ink TUI + reactive tool loop”。下一阶段不再继续修 TUI 基础布局，工作重心转向 **Agentic workflow**。

## Gap Review (2026-06-22)

| Gap | 发现 | 处理 |
|---|---|---|
| G-001 | Phase 5 MCP 与 Non-Goals 冲突 | 明确 MCP deferred to v23，不纳入 v22 验收 |
| G-002 | `myz-agent/README.md` 仍是 `myz-bot`/Telegram/ai-core 旧文档 | 已重写为 `myz-agent` 多包架构、配置、命令、开发命令 |
| G-003 | `/tools`、`/compact` 返回“待实现” | 已接入 runtime `listTools()` / `compactSession()` 并增加 tests |
| G-004 | `/model` 命令只更新文案，不切换 runtime client | 已更新 `runtime.config.defaults` 并重建 LLM client |
| G-005 | 状态栏 token/model 不随 runtime 更新 | 已增加 runtime token state，并在 TUI 中刷新 model/token |
| G-006 | Ink 多行输入 cursor/IME buffer 漂移 | 已改为手动 wrapping model，支持软换行和 `\n`/`\r\n`，并记录 lesson learned |
| G-007 | Tool/Reasoning 折叠展开缺少正式 event-entry/focus 模型 | runtime entry 映射与 detail 渲染已完成；keyboard focus/action model 延期到 v23 |
| G-008 | 自定义 transcript viewport scroll 与 terminal scrollback/触控板行为冲突 | 已删除自定义 scroll、mouse tracking、PageUp/PageDown 历史控制，改用 terminal 原生 scrollback |
| G-009 | `Static` scrollback 与 full-height live frame 组合导致新历史被推到屏幕外 | 已移除 `height=rows-1` 和空 `flexGrow` pending 区，live 区域只保留 pending/InputBar/StatusBar |
| G-010 | Agentic workflow 只有 reactive loop，没有 Plan/Act/Verify 状态机 | 标注为 v23 Future Plan，不纳入 v22 Done |
| G-011 | Subagent 有 Task 入口但未复用完整工具执行链 | 标注为 v23 Future Plan：隔离 runtime、权限、预算、事件回传 |
| G-012 | Permissions `ask` 规则缺少 TUI interactive approval | 标注为 v23 Future Plan：审批 UI 与 tool execution policy |

## Future Plan: v23 Agentic Workflow（Draft）

> 本节是 v22 之后的实施方向，不作为 v22 验收项。v23 开始前必须拆成独立 PRD/track，并补齐 DoD、验收矩阵和反作弊检查。

### Goals

- 从“reactive tool loop”升级为可追踪的 **Plan → Act → Verify → Report** workflow。
- 让 agent 在多步骤开发任务中维护明确任务状态、验证状态和失败恢复路径。
- 让 subagent 成为可隔离执行的 workflow participant，而不是只返回文本摘要。
- 让 permissions `ask` 成为可交互审批能力，避免高风险工具调用直接执行。

### Candidate Work Items

| ID | 方向 | 当前状态 | v23 验收口径（草案） |
|---|---|---|---|
| WF-001 | Workflow state machine | Not started | 每个用户任务必须生成 `plan/act/verify/report` 状态；状态变更可进入 transcript/session log |
| WF-002 | Task/todo model | Not started | Agent 可维护结构化 todo：`pending/in_progress/done/blocked`；完成报告必须引用 todo 验证结果 |
| WF-003 | Verification gate | Partial（人工命令验证） | 当 agent 修改代码时，必须记录执行过的 typecheck/test/build 或明确说明未执行原因 |
| WF-004 | Interactive permission approval | Not started | `ask` 命中时 TUI 显示 tool、args、risk，用户选择 approve/deny 后才执行 |
| WF-005 | Canonical tool policy | Partial | 权限匹配统一使用 canonical tool name（如 `Run`/`bash` 映射），大小写不导致绕过/误拒绝 |
| WF-006 | Subagent isolated runtime | Partial | Task subagent 可在隔离 messages/budget/permissions 中执行允许的工具，并向 parent 回传 structured result + events |
| WF-007 | Subagent transcript surfacing | Not started | Parent transcript 可显示 subagent start/progress/result，且不污染主 agent 的 user-visible answer |
| WF-008 | Checkpoint/resume/fork | Partial | 每个 workflow step 可 checkpoint；`/resume` 恢复 active workflow；`/fork` 从 checkpoint 分支继续 |
| WF-009 | Context + workflow memory | Partial | Compaction 必须保留 active plan、open todos、recent tool evidence，不丢失未完成任务 |
| WF-010 | Regression/evaluation suite | Not started | 增加多步 coding task fixtures，验证 tool order、permission ask、verification gate、resume 行为 |
| WF-011 | MCP tool ingestion | Deferred | MCP tools 进入统一 tool registry，并复用 permissions/workflow/event model |

### Non-Goals for the first v23 slice

- 不做成本统计；token status 继续维持当前能力。
- 不做 LSP 集成。
- 不做 deterministic hooks 脚本系统；先把 workflow state 和 approval path 做稳。
- 不重写已稳定的 InputBar/StatusBar 基础布局。

### Suggested v23 Phasing

1. **v23.1 Workflow model**：定义 workflow/todo/checkpoint schema，接入 session log，TUI 只做只读显示。
2. **v23.2 Permission approval**：实现 `ask` interactive approval，统一 canonical tool policy。
3. **v23.3 Verification gate**：把测试/构建结果纳入 workflow report，失败时进入 blocked/retry。
4. **v23.4 Subagent runtime**：让 Task 使用隔离 runtime 执行工具，回传 structured result/events。
5. **v23.5 MCP**：在 workflow/permission/event model 稳定后接入 MCP tools。

## 变更日志

| 日期 | 变更 | 影响范围 |
|---|---|---|
| 2026-06-17 | 初始版本 | 全局 |
| 2026-06-18 | Phase 1-3 完成，Phase 4/5 待验收 | 全局 |
| 2026-06-22 | v22 gap review：补 `/tools` `/compact` `/model` runtime 切换、TUI 输入和状态栏，MCP 明确延期 v23 | myz-agent, agent-core, agent-tui, docs |
| 2026-06-22 | v22 实现状态复核：TUI 改为 terminal 原生 scrollback，记录 Agentic workflow v23 future plan | agent-tui, agent-core, myz-agent, docs |
