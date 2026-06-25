# v23 Agentic Loop + Agent Sandbox

## Vision

让 myz-agent 从 reactive tool loop 升级为可追踪的 Agentic Loop，配合分级权限沙箱，支撑多步骤开发任务的可靠执行。

**验收口径**：
- Agent 可维护结构化 todo，持久化到 `todo.json`，用户可交互调整
- 权限系统支持分级 permission（session/workspace/global），Modal UI 支持 Y/N/allow for session/allow for workspace
- SubAgent 可在隔离 runtime 中执行允许的工具，返回 structured result
- 内置 Agent（Explore/Plan）预定义 tools，用户可通过 markdown 自定义 SubAgent

## Background / Motivation

v22 已完成 reactive tool loop（`runAgentLoop()`）和稳定 Ink TUI。但 agent 执行多步骤任务时：
- 无法追踪任务状态（todo）
- 权限 `ask` 只返回匹配结果，没有 TUI 交互
- SubAgent 工具执行受限，没有复用主 runtime 工具执行链
- 用户无法通过 markdown 自定义 SubAgent

下一步必须让 agent 能可靠地完成多步骤开发任务，并且权限控制能支撑高风险操作的审批。

## Scope

### In Scope

- Todo model（结构化 todo，支持 subtask 和 dependency）
- 分级 permission（session/workspace/global，同级别内 last-match-wins）
- 权限规则格式（`Tool(pattern1, pattern2)`，支持 `,` 分割多个）
- 权限模式（readonly / acceptEdits / auto / bypass）
- Modal UI（Y/N/allow for session/allow for workspace）
- Modal glob 输入（用户输入 glob pattern，验证匹配后持久化）
- QueryPermission 工具（返回详细信息）
- auto mode（LLM 判断，用户可配置提示信息）
- Agent markdown 定义（name/description/tools/model + system prompt）
- 内置 Agent 预定义（Explore/Plan 的 tools 和 prompt）
- SubAgent isolated runtime
- SubAgent structured result
- SubAgent transcript surfacing
- Context + todo memory（compaction 保留 active todos）
- Regression suite

### Non-Goals

- Workflow（脚本驱动 + Agentic loop），后续单独立项
- 成本统计（token status 维持当前能力）
- LSP 集成
- deterministic hooks 脚本系统
- MCP tool ingestion（放 v23.5）
- 重写已稳定的 InputBar/StatusBar 基础布局
- 运行时级别的沙箱隔离（Docker/容器）

## Non‑Goals

- Workflow（脚本驱动 + Agentic loop），后续单独立项
- 成本统计
- LSP 集成
- deterministic hooks
- MCP tool ingestion
- 重写 InputBar/StatusBar
- 运行时级别沙箱隔离

## Data Model (schema-first)

### Todo Item

```typescript
interface TodoItem {
  id: string
  text: string
  status: "pending" | "in_progress" | "done" | "blocked"
  parentId?: string  // subtask 的父 todo id
  dependsOn?: string[]  // 依赖的 todo id 列表
  verification?: {
    type: string  // "typecheck" | "test" | "build" | "manual"
    result: "pass" | "fail" | "skip"
    evidence: string  // 命令输出、错误信息等
  }
  createdAt: string
  updatedAt: string
}
```

### Permission Rule

```typescript
interface PermissionRule {
  pattern: string  // "Edit(**/*.js)" | "Run(rm **)" | "Run(rm *, sed *)"
  action: "allow" | "ask" | "deny"
}
```

### Permission Context

```typescript
interface PermissionContext {
  agent: string
  tool: string
  args?: Record<string, unknown>
}

interface PermissionResult {
  result: "allow" | "deny" | "ask" | "auto"
  rule?: string
  level?: "session" | "workspace" | "global"
  reason?: string
}
```

### Agent Definition (markdown)

```typescript
interface AgentDefinition {
  name: string  // 不可以是 Explore/Plan 等内置 Agent
  description: string  // 用于主 Agent 判断是否需要创建 SubAgent
  tools: string[]  // ["Read", "Glob", "Grep"] 或 ["Edit(**/*.js)", "Run(rm **)"]
  model?: string  // provider:model_id，默认与主 Agent 一致
  prompt: string  // system/developer prompt
}
```

### Agent Markdown 示例

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep
model: sonnet
---

You are a code reviewer. When invoked, analyze the code and provide
specific, actionable feedback on quality, security, and best practices.
```

### Permission Mode

```typescript
type PermissionMode = "readonly" | "acceptEdits" | "auto" | "bypass"
```

### Modal UI State

```typescript
interface ModalState {
  visible: boolean
  tool: string
  args: Record<string, unknown>
  riskLevel: "low" | "medium" | "high"
  defaultPattern: string  // 原命令/路径
  onChoice: (choice: "y" | "n" | "session" | "workspace", pattern?: string) => void
}
```

### permissions.json

```json
{
  "session": [
    { "pattern": "Run(rm -rf node_modules)", "action": "allow" }
  ],
  "workspace": [
    { "pattern": "Edit(**/*.js)", "action": "allow" }
  ],
  "global": [
    { "pattern": "Run(rm **)", "action": "deny" }
  ]
}
```

### todo.json

```json
{
  "todos": [
    {
      "id": "todo-1",
      "text": "拆分工具注册逻辑",
      "status": "done",
      "verification": {
        "type": "typecheck",
        "result": "pass",
        "evidence": "npm run typecheck: 0 errors"
      },
      "createdAt": "2026-06-22T10:00:00Z",
      "updatedAt": "2026-06-22T10:05:00Z"
    },
    {
      "id": "todo-2",
      "text": "验证拆分后的代码",
      "status": "in_progress",
      "dependsOn": ["todo-1"],
      "createdAt": "2026-06-22T10:05:00Z",
      "updatedAt": "2026-06-22T10:05:00Z"
    }
  ]
}
```

## UX / Flow

### 主路径：多步骤代码重构

1. 用户输入 "帮我重构 src/tools.ts，把工具注册逻辑拆到独立文件"
2. Agent 创建 todo（拆分、迁移、验证）
3. Agent 执行 Edit 工具修改文件
4. Agent 主动决定运行 typecheck 验证
5. Agent 更新 todo 状态，汇总验证结果

### 权限路径：高风险工具审批

1. Agent 调用 QueryPermission 检查权限
2. TUI 显示 Modal（Y/N/allow for session/allow for workspace）
3. 用户选择后，若选择 allow for session/workspace，提示输入 glob pattern
4. 验证匹配后持久化到 `permissions.json`

### auto mode 路径

1. Agent 调用 QueryPermission 检查权限，返回 `{ result: "auto" }`
2. auto mode prompt 追加到主 Agent 的 message 里
3. LLM 判断 allow/deny

### SubAgent 路径

1. Agent 调用 Task 工具，agentId=code-reviewer
2. Task 工具从 `$workspaceRoot/.myz/agents/code-reviewer.md` 读取定义
3. 创建 isolated runtime（独立 messages、budget、permissions）
4. Code-reviewer 在 isolated runtime 中执行 Read/Glob 工具
5. SubAgent 返回 structured result
6. Parent transcript 显示 subagent start/progress/result

## Dependencies / Constraints

### 依赖模块

- `packages/agent-core`：permissions、todo、agents、subagent
- `packages/agent-tui`：ApprovalModal、ChatHistory
- `myz-agent`：cli、config、runtime

### 约束

- Todo/permission 更新不能阻塞 LLM 响应
- Modal 不阻塞 event loop
- auto mode 的 LLM 调用作为 prompt 追加，不增加明显延迟
- Permission approval 必须在 tool 执行前
- deny 时 tool 不执行
- 用户输入的 glob pattern 必须验证匹配后才持久化

## Acceptance Criteria

### Phase 1: Todo + Agent Definition

- [ ] Todo model 实现（pending/in_progress/done/blocked，支持 subtask 和 dependency）
- [ ] Todo 持久化到 `todo.json`
- [ ] Agent markdown 定义支持 name/description/tools/model + system prompt
- [ ] Agent markdown 中 tools 支持 glob pattern（如 `Edit(**/*.js)`, `Run(rm **)`）
- [ ] 内置 Agent（Explore/Plan）预定义 tools（Read, List, Glob, Grep）和 prompt
- [ ] Context compaction 保留 active todos
- [ ] 所有测试通过 + 构建成功

### Phase 2: Permission Sandbox

- [ ] 分级 permission 实现（session/workspace/global，同级别内 last-match-wins）
- [ ] 权限规则格式实现（`Tool(pattern1, pattern2)`，支持 `,` 分割多个）
- [ ] 权限模式实现（readonly / acceptEdits / auto / bypass）
- [ ] Modal UI 实现（Y/N/allow for session/allow for workspace）
- [ ] Modal glob 输入实现（用户输入 glob pattern，验证匹配后持久化）
- [ ] QueryPermission 工具实现（返回详细信息）
- [ ] auto mode 实现（LLM 判断，用户可配置提示信息）
- [ ] `permissions.json` 持久化
- [ ] 所有测试通过 + 构建成功

### Phase 3: Verification Gate

- [ ] Agent 主动决定是否验证（不是 Edit/Write 强制触发）
- [ ] Todo verification 字段记录验证结果（type/test/build/manual，pass/fail/skip，evidence）
- [ ] 验证结果进入 transcript
- [ ] 所有测试通过 + 构建成功

### Phase 4: SubAgent Runtime

- [ ] SubAgent 创建时，内置 Agent 用预定义 tools，用户自定义 Agent 从 markdown 读取，其他由 Parent 决定
- [ ] SubAgent isolated runtime 实现（独立 messages/budget/permissions）
- [ ] SubAgent structured result 实现（content + toolCalls + events + error）
- [ ] SubAgent transcript surfacing 实现（parent 可见 subagent start/progress/result）
- [ ] 所有测试通过 + 构建成功

### Phase 5: Regression + Integration

- [ ] 增加多步 coding task fixtures
- [ ] 验证 tool order、permission ask、todo 状态、subagent 执行
- [ ] 所有测试通过 + 构建成功

## Verification Plan

### Phase 1 验证

- 单元测试：`packages/agent-core/tests/todo.test.ts`
- 单元测试：`packages/agent-core/tests/agents.test.ts`
- 手动验证：创建 todo、更新状态、持久化

### Phase 2 验证

- 单元测试：`packages/agent-core/tests/permissions.test.ts`
- 单元测试：`packages/agent-tui/tests/ApprovalModal.test.tsx`
- 手动验证：Modal UI、glob 输入、permissions.json 持久化

### Phase 3 验证

- 单元测试：`packages/agent-core/tests/verification.test.ts`
- 手动验证：Todo verification 字段、验证结果进入 transcript

### Phase 4 验证

- 单元测试：`packages/agent-core/tests/subagentRuntime.test.ts`
- 单元测试：`packages/agent-tui/tests/ChatHistory.test.tsx`
- 手动验证：SubAgent isolated runtime、structured result、transcript surfacing

### Phase 5 验证

- E2E 测试：`myz-agent/tests/agenticRegression.test.ts`
- 手动验证：多步 coding task、permission ask、todo 状态、subagent 执行

## Risks / Rollback

| 风险 | 影响 | 缓解 |
|---|---|---|
| Modal UI 与 InputBar 冲突 | 高 | Modal 在 InputBar 上方，不遮盖 InputBar |
| auto mode LLM 判断延迟 | 中 | 作为 prompt 追加，不阻塞；用户可关闭 auto mode |
| Todo 持久化并发 | 低 | 使用文件锁或原子写入 |
| SubAgent isolated runtime 复杂度 | 中 | 先实现最小闭环，再逐步增强 |
| 分级 permission 合并逻辑 | 中 | Session > Workspace > Global，同级别内 last-match-wins |

## Use Cases / Scenarios

### 主路径：多步骤代码重构

- 角色：开发者
- 触发：用户输入 "帮我重构 src/tools.ts，把工具注册逻辑拆到独立文件"
- 预期：Todo 按 pending → in_progress → done 推进；验证结果进入 todo 的 verification 字段

### 权限路径：高风险工具审批

- 角色：开发者
- 触发：Agent 调用 `Run` 工具执行 `rm -rf node_modules`
- 预期：Modal 显示，用户选择后持久化到 `permissions.json`

### auto mode 路径

- 角色：开发者
- 触发：Agent 调用 `Run` 工具执行 `npm test`，权限模式为 auto
- 预期：LLM 判断 allow/deny，不增加明显延迟

### SubAgent 路径

- 角色：开发者
- 触发：Agent 调用 Task 工具，agentId=code-reviewer
- 预期：SubAgent 在 isolated runtime 中执行，返回 structured result

### 失败路径：权限拒绝

- 角色：开发者
- 触发：Agent 调用 `Run` 工具执行 `rm -rf /`，权限 deny
- 预期：Tool 不执行，返回错误信息

## Boundary Conditions

- [ ] 空值/缺失字段：Todo 为空时的行为；Permission 规则为空时的默认行为
- [ ] 最大长度/数量上限：Todo 最大数量；Permission 规则最大数量
- [ ] 非法输入格式：用户输入的 glob pattern 不合法时的错误处理
- [ ] 权限不足/不可用状态：所有权限都 deny 时的行为；auto mode LLM 判断失败时的默认行为
- [ ] 网络失败/超时：auto mode 的 LLM 调用超时时的处理
- [ ] 并发/重复提交：多个 tool call 同时触发 Modal 时的行为

## Open Questions

- [ ] auto mode 的 LLM 判断失败时，默认是 allow 还是 deny？（倾向 deny，安全优先）
- [ ] Modal UI 的交互方式：y/n 之外，是否支持 Tab+Enter 选择 allow for session/workspace？（需要实现）
- [ ] Todo 最大数量限制？（暂定 1000）
- [ ] Permission 规则最大数量限制？（暂定 100）
