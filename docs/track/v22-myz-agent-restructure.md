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
  4. 加载 <workspace>/.agents/myz/mcp.yml (MCP server 配置)
  5. 加载 <workspace>/.agents/skills/ (加载 skills)
  6. 注册内置 tools (List, Read, Write, Edit, Glob, Run, Browser*)
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
- Subagent 状态 — 显示正在运行的 subagent，可切换查看其输出
- 用 `<Static>` 组件渲染，不重绘，IME 友好

**层 2: 输入框** (光标跟随, 自动扩展)
- `TextInput` 或 readline — 方向键在文本内导航
- Slash command 自动完成（`/` 触发候选列表）
- `@` 文件引用自动完成
- 光标完全跟随输入状态

**层 3: 底部状态栏**
- 工作区 | 模型 | context token 用量 | 当前 agent | 版本号

**验收标准**：
- [ ] Assistant 输出正确渲染 Markdown（bold, code, list, heading）
- [ ] Tool Use 折叠/展开正常
- [ ] Reasoning 折叠/展开正常
- [ ] 输入框方向键导航正常
- [ ] IME 输入光标位置正确
- [ ] 底部状态栏信息实时更新
- [ ] Session 历史持久化到 JSONL

### Phase 5: MCP + 生产化

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

## 变更日志

| 日期 | 变更 | 影响范围 |
|---|---|---|
| 2026-06-17 | 初始版本 | 全局 |
| 2026-06-18 | Phase 1-5 完成，所有组件集成 | 全局 |
