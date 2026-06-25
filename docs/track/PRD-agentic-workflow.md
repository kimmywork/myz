# PRD: Agentic Loop + Agent Sandbox

## 0) 元信息

- Topic：Agentic Loop + Agent Sandbox — 从 reactive tool loop 升级到可追踪的 Agentic Loop，配合分级权限沙箱
- Owner：myz-agent
- Status：draft
- Last updated：2026-06-22

## 1) 背景与问题

**当前状态**：v22 已完成 reactive tool loop（`runAgentLoop()`），支持 LLM → tool call → tool result → LLM 迭代。permissions 引擎支持 glob pattern + last-match-wins。但存在以下问题：

1. **无任务状态管理** — Agent 执行多步骤任务时，无法追踪当前处于 plan/act/verify/report 哪个阶段。用户无法知道 agent 是否完成了验证。

2. **无结构化 todo** — Agent 内部维护任务列表，但没有结构化数据模型。用户无法看到 todo 清单和完成状态。

3. **权限系统不完整** — `ask` 只返回匹配结果，没有 TUI 交互让用户审批。高风险工具调用直接执行。无分级 permission（session/workspace/global）。

4. **Subagent 工具执行受限** — `spawnSubagent()` 有 Task 入口，但 subagent 内部 tool call 返回 `[Tool ${tc.name} not available in subagent mode]`，没有复用主 runtime 工具执行链。

5. **Subagent 配置不灵活** — 内置 Agent 的 tools 硬编码，用户无法通过 markdown 自定义 SubAgent 的 tools 和 prompt。

**为什么现在必须做**：v22 的 TUI 和基础 runtime 已稳定，下一步必须让 agent 能可靠地完成多步骤开发任务，并且权限控制能支撑高风险操作的审批。

**区分 Workflow vs Agentic Loop**：
- **Workflow** = 脚本驱动 + Agentic loop（后续实现，不在本 PRD scope）
- **Agentic Loop** = 当前 v23 要做的，增强 reactive loop + 权限沙箱

## 2) 目标（可验收）

- **G1**：Agent 可维护结构化 todo（pending/in_progress/done/blocked），支持 subtask 和 dependency。Todo 持久化到 `todo.json`，用户可交互调整。
- **G2**：权限系统支持分级 permission（session/workspace/global），同级别内 last-match-wins，高级别覆盖低级别。
- **G3**：`ask` 命中时 TUI 显示 Modal（Y/N/allow for session/allow for workspace），选择后两项时用户输入 glob pattern 并验证匹配。
- **G4**：提供 QueryPermission 工具给主 Agent，返回详细权限信息（result, rule, level, reason），减少用户交互。
- **G5**：支持 auto mode，通过 LLM 判断操作是否允许，用户可在配置中添加 auto mode 提示信息。
- **G6**：内置 Agent（Explore/Plan）预定义 tools（Read, List, Glob, Grep）和 prompt，用户可通过 `$workspaceRoot/.myz/agents/*.md` 自定义 SubAgent。
- **G7**：Agent markdown 支持 name/description/tools/model + system prompt，tools 支持 glob pattern（如 `Edit(**/*.js)`, `Run(rm **)`）。
- **G8**：SubAgent 创建时，内置 Agent用预定义 tools，用户自定义 Agent 从 markdown 读取 tools，其他由 Parent 决定。
- **G9**：SubAgent 在隔离 runtime 中执行允许的工具，返回 structured result（content + toolCalls + events + error）。

## 3) 非目标（防返工）

- **NG1**：不做 Workflow（脚本驱动 + Agentic loop），后续单独立项。
- **NG2**：不做成本统计（token status 维持当前能力）。
- **NG3**：不做 LSP 集成。
- **NG4**：不做 deterministic hooks 脚本系统。
- **NG5**：不做 MCP tool ingestion（放 v23.5，在 workflow/permission/event model 稳定后接入）。
- **NG6**：不重写已稳定的 InputBar/StatusBar 基础布局。
- **NG7**：不实现运行时级别的沙箱隔离（Docker/容器），只做工具级别的权限控制。

## 4) 术语

| 术语 | 定义 |
|---|---|
| Agentic Loop | 增强的 reactive tool loop，配合 Todo 和权限沙箱，不是脚本驱动的 Workflow |
| Workflow | 脚本驱动 + Agentic loop（后续实现，不在本 PRD scope） |
| Todo | 结构化的任务列表项，有 pending/in_progress/done/blocked 状态，支持 subtask 和 dependency |
| Agent Sandbox | 工具级别的权限控制模块，支持分级 permission、Modal UI、auto mode、QueryPermission |
| Permission Mode | 主 Agent 的权限模式：readonly / acceptEdits / auto / bypass |
| Permission Rule | 权限规则，格式为 `Tool(pattern1, pattern2)`，如 `Edit(**/*.js)`, `Run(rm **)` |
| Modal UI | Permission approval 的 TUI 交互，支持 Y/N/allow for session/allow for workspace |
| QueryPermission | 工具，主 Agent 用来判断权限，返回详细信息 |
| auto mode | 通过 LLM 判断操作是否允许，用户可在配置中添加提示信息 |
| Canonical Tool Name | 统一的工具名映射，如 Run/bash，避免大小写/别名导致权限绕过 |
| Isolated Runtime | SubAgent 使用独立的 messages/budget/permissions，不共享主 runtime 状态 |
| Structured Result | SubAgent 返回的结构化结果（content + toolCalls + events + error），而非纯文本 |
| Agent Definition | Agent 的 markdown 定义文件，包含 name/description/tools/model + system prompt |

## 5) 场景

### S1: 多步骤代码重构（主路径）

- 角色：开发者
- 触发：用户输入 "帮我重构 src/tools.ts，把工具注册逻辑拆到独立文件"
- 步骤：
  1. Agent 创建 todo（拆分、迁移、验证）
  2. Agent 执行 Edit 工具修改文件
  3. Agent 主动决定运行 typecheck 验证
  4. Agent 更新 todo 状态，汇总验证结果
- 预期：Todo 按 pending → in_progress → done 推进；验证结果进入 todo 的 verification 字段；最终报告引用 typecheck 结果

### S2: 高风险工具审批（权限路径）

- 角色：开发者
- 触发：Agent 调用 `Run` 工具执行 `rm -rf node_modules`
- 步骤：
  1. Agent 调用 QueryPermission 检查权限，返回 `{ result: "ask", rule: "Run(rm **)", level: "workspace", reason: "匹配 workspace 级别规则" }`
  2. TUI 显示 Modal：tool name、args、risk level
  3. 用户选择 Y/N/allow for session/allow for workspace
  4. 若选择 allow for session/workspace，提示用户输入 glob pattern（默认 `rm -rf node_modules`，用户可编辑为 `rm -rf *`）
  5. 验证用户输入是否匹配原命令，不匹配则重新提示
  6. 持久化到 `permissions.json`
- 预期：approval 必须在 tool 执行前；deny 时 tool 不执行；approval 状态进入 session log

### S3: auto mode 自动审批（auto 路径）

- 角色：开发者
- 触发：Agent 调用 `Run` 工具执行 `npm test`，权限模式为 auto
- 步骤：
  1. Agent 调用 QueryPermission 检查权限，返回 `{ result: "auto" }`
  2. auto mode prompt 追加到主 Agent 的 message 里，包含 tool + args + 用户配置的提示信息
  3. LLM 判断 allow/deny
  4. 若 allow，执行；若 deny，返回错误
- 预期：auto mode 不增加明显延迟；LLM 判断结果进入 session log

### S4: SubAgent 执行隔离任务（subagent 路径）

- 角色：开发者
- 触发：Agent 调用 Task 工具，agentId=code-reviewer, task="Review src/tools.ts"
- 步骤：
  1. Task 工具从 `$workspaceRoot/.myz/agents/code-reviewer.md` 读取 Agent 定义
  2. 创建 isolated runtime（独立 messages、budget、permissions）
  3. Code-reviewer subagent 在 isolated runtime 中执行 Read/Glob 工具
  4. Subagent 返回 structured result（content + toolCalls + events）
  5. Parent transcript 显示 subagent start/progress/result
- 预期：subagent 工具调用在 isolated runtime 中执行；parent 可见 subagent 进度；subagent 不污染主 agent 的 user-visible answer

### S5: 用户自定义 Todo（交互路径）

- 角色：开发者
- 触发：用户输入 "把验证步骤拆成 typecheck 和 test 两个 todo"
- 步骤：
  1. Agent 更新 todo.json，新增两个 todo 项
  2. Agent 确认更新
- 预期：Todo 更新后持久化；用户可继续调整

## 6) 需求清单

| Req ID | 需求 | 验收口径 | 验证方式 | 优先级 | 依赖 |
|---|---|---|---|---|---|
| REQ-001 | Todo model | Agent 可维护结构化 todo：pending/in_progress/done/blocked；支持 subtask 和 dependency；持久化到 `todo.json` | 单元测试 | P0 | — |
| REQ-002 | Todo 交互 | 用户可通过消息调整 Todo（如"把验证步骤拆成 typecheck 和 test 两个 todo"） | 手动验证 | P1 | REQ-001 |
| REQ-003 | 分级 permission | session > workspace > global，同级别内 last-match-wins | 单元测试 | P0 | — |
| REQ-004 | 权限规则格式 | 格式为 `Tool(pattern1, pattern2)`，如 `Edit(**/*.js)`, `Run(rm **)`；pattern 支持 `,` 分割多个 | 单元测试 | P0 | REQ-003 |
| REQ-005 | Modal UI | `ask` 命中时 TUI 显示 Modal（Y/N/allow for session/allow for workspace） | 手动验证 | P0 | REQ-003 |
| REQ-006 | Modal glob 输入 | 选择 allow for session/workspace 时，用户输入 glob pattern；验证匹配后持久化到 `permissions.json` | 手动验证 + 单元测试 | P0 | REQ-005 |
| REQ-007 | QueryPermission 工具 | 返回详细信息（result, rule, level, reason） | 单元测试 | P0 | REQ-003 |
| REQ-008 | auto mode | 通过 LLM 判断操作是否允许；用户可在配置中添加 auto mode 提示信息 | 手动验证 | P1 | REQ-003 |
| REQ-009 | 权限模式 | 主 Agent 支持 readonly / acceptEdits / auto / bypass 四种模式 | 单元测试 | P0 | REQ-003 |
| REQ-010 | Agent markdown 定义 | 支持 name/description/tools/model + system prompt；tools 支持 glob pattern | 单元测试 | P0 | — |
| REQ-011 | 内置 Agent 预定义 | Explore/Plan 预定义 tools（Read, List, Glob, Grep）和 prompt | 单元测试 | P0 | REQ-010 |
| REQ-012 | SubAgent 工具配置 | 内置 Agent 用预定义 tools；用户自定义 Agent 从 markdown 读取；其他由 Parent 决定 | 单元测试 | P0 | REQ-010, REQ-011 |
| REQ-013 | SubAgent isolated runtime | SubAgent 在隔离 messages/budget/permissions 中执行允许的工具 | 单元测试 | P0 | REQ-012 |
| REQ-014 | SubAgent structured result | SubAgent 返回 content + toolCalls + events + error | 单元测试 | P0 | REQ-013 |
| REQ-015 | SubAgent transcript surfacing | Parent transcript 显示 subagent start/progress/result，不污染主 agent 的 user-visible answer | TUI 验证 | P1 | REQ-013, REQ-014 |
| REQ-016 | Context + todo memory | Compaction 保留 active todos，不丢失未完成任务 | 单元测试 | P1 | REQ-001 |
| REQ-017 | Regression suite | 增加多步 coding task fixtures，验证 tool order、permission ask、todo 状态 | E2E 测试 | P1 | REQ-001–REQ-016 |

## 7) 约束

- **性能**：Todo/permission 更新不能阻塞 LLM 响应；Modal 不阻塞 event loop；auto mode 的 LLM 调用作为 prompt 追加，不增加明显延迟。
- **安全**：Permission approval 必须在 tool 执行前；deny 时 tool 不执行；用户输入的 glob pattern 必须验证匹配后才持久化。
- **平台**：Ink TUI（Node.js）；不支持浏览器环境。
- **数据**：Todo 持久化到 `todo.json`；Permission 持久化到 `permissions.json`；Session 历史持久化到 JSONL。
- **兼容**：不破坏 v22 已有的 reactive loop 行为；Agentic Loop 是增强而非替换。

## 8) 追溯矩阵

| Req ID | vN 计划 | 测试 | 代码路径 |
|---|---|---|---|
| REQ-001 | v23 Phase 1 | `packages/agent-core/tests/todo.test.ts` | `packages/agent-core/src/todo.ts` |
| REQ-002 | v23 Phase 1 | 手动验证 | `myz-agent/src/cli.ts` |
| REQ-003 | v23 Phase 2 | `packages/agent-core/tests/permissions.test.ts` | `packages/agent-core/src/permissions.ts` |
| REQ-004 | v23 Phase 2 | `packages/agent-core/tests/permissions.test.ts` | `packages/agent-core/src/permissions.ts` |
| REQ-005 | v23 Phase 2 | `packages/agent-tui/tests/ApprovalModal.test.tsx` | `packages/agent-tui/src/ApprovalModal.tsx` |
| REQ-006 | v23 Phase 2 | `packages/agent-tui/tests/ApprovalModal.test.tsx` | `packages/agent-tui/src/ApprovalModal.tsx` |
| REQ-007 | v23 Phase 2 | `packages/agent-core/tests/permissions.test.ts` | `packages/agent-core/src/permissions.ts` |
| REQ-008 | v23 Phase 2 | 手动验证 | `packages/agent-core/src/permissions.ts` |
| REQ-009 | v23 Phase 2 | `packages/agent-core/tests/permissions.test.ts` | `packages/agent-core/src/permissions.ts` |
| REQ-010 | v23 Phase 1 | `packages/agent-core/tests/agents.test.ts` | `packages/agent-core/src/agents.ts` |
| REQ-011 | v23 Phase 1 | `packages/agent-core/tests/agents.test.ts` | `packages/agent-core/src/agents.ts` |
| REQ-012 | v23 Phase 4 | `packages/agent-core/tests/subagentRuntime.test.ts` | `packages/agent-core/src/subagent.ts` |
| REQ-013 | v23 Phase 4 | `packages/agent-core/tests/subagentRuntime.test.ts` | `packages/agent-core/src/subagent.ts` |
| REQ-014 | v23 Phase 4 | `packages/agent-core/tests/subagentRuntime.test.ts` | `packages/agent-core/src/subagent.ts` |
| REQ-015 | v23 Phase 4 | `packages/agent-tui/tests/ChatHistory.test.tsx` | `packages/agent-tui/src/ChatHistory.tsx` |
| REQ-016 | v23 Phase 1 | `packages/agent-core/tests/contextCompaction.test.ts` | `packages/agent-core/src/contextCompaction.ts` |
| REQ-017 | v23 Phase 5 | `myz-agent/tests/agenticRegression.test.ts` | — |

## 9) 边界条件

- [ ] 空值/缺失字段：Todo 为空时的行为；Permission 规则为空时的默认行为
- [ ] 最大长度/数量上限：Todo 最大数量；Permission 规则最大数量
- [ ] 非法输入格式：用户输入的 glob pattern 不合法时的错误处理
- [ ] 权限不足/不可用状态：所有权限都 deny 时的行为；auto mode LLM 判断失败时的默认行为
- [ ] 网络失败/超时：auto mode 的 LLM 调用超时时的处理
- [ ] 并发/重复提交：多个 tool call 同时触发 Modal 时的行为

## 10) 追溯矩阵

| Req ID | v23 计划 | 测试 | 代码路径 |
|---|---|---|---|
| REQ-001 | Phase 1 | `packages/agent-core/tests/todo.test.ts` | `packages/agent-core/src/todo.ts` |
| REQ-002 | Phase 1 | 手动验证 | CLI handler |
| REQ-003 | Phase 2 | `packages/agent-core/tests/permissions.test.ts` | `packages/agent-core/src/permissions.ts` |
| REQ-004 | Phase 2 | `packages/agent-core/tests/permissions.test.ts` | `packages/agent-core/src/permissions.ts` |
| REQ-005 | Phase 2 | `packages/agent-tui/tests/ApprovalModal.test.tsx` | `packages/agent-tui/src/ApprovalModal.tsx` |
| REQ-006 | Phase 2 | `packages/agent-tui/tests/ApprovalModal.test.tsx` | `packages/agent-tui/src/ApprovalModal.tsx` |
| REQ-007 | Phase 2 | `packages/agent-core/tests/permissions.test.ts` | `packages/agent-core/src/permissions.ts` |
| REQ-008 | Phase 2 | 手动验证 | `packages/agent-core/src/permissions.ts` |
| REQ-009 | Phase 2 | `packages/agent-core/tests/permissions.test.ts` | `packages/agent-core/src/permissions.ts` |
| REQ-010 | Phase 1 | `packages/agent-core/tests/agents.test.ts` | `packages/agent-core/src/agents.ts` |
| REQ-011 | Phase 1 | `packages/agent-core/tests/agents.test.ts` | `packages/agent-core/src/agents.ts` |
| REQ-012 | Phase 4 | `packages/agent-core/tests/subagentRuntime.test.ts` | `packages/agent-core/src/subagent.ts` |
| REQ-013 | Phase 4 | `packages/agent-core/tests/subagentRuntime.test.ts` | `packages/agent-core/src/subagent.ts` |
| REQ-014 | Phase 4 | `packages/agent-core/tests/subagentRuntime.test.ts` | `packages/agent-core/src/subagent.ts` |
| REQ-015 | Phase 4 | `packages/agent-tui/tests/ChatHistory.test.tsx` | `packages/agent-tui/src/ChatHistory.tsx` |
| REQ-016 | Phase 1 | `packages/agent-core/tests/contextCompaction.test.ts` | `packages/agent-core/src/contextCompaction.ts` |
| REQ-017 | Phase 5 | `myz-agent/tests/agenticRegression.test.ts` | — |
