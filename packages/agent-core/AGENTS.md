# @myz/agent-core

核心 agent 运行时包。包含 agent loop、扩展 API、权限引擎、工具系统、上下文压缩、规则、命令、子 agent、agent 定义、todo 管理、分级权限沙箱。

## 依赖链

```
@myz/agent-providers → @myz/agent-core
```

## 模块

| 模块 | 职责 |
|---|---|
| `loop.ts` | Agent loop (LLM → tool call → result → LLM) |
| `extensions.ts` | Extension API (register tool/hook/agent/prompt/command) |
| `permissions.ts` | 分级权限沙箱 (session/workspace/global，Tool(pattern) 格式，readonly/acceptEdits/auto/bypass 模式) |
| `types.ts` | 所有类型定义 (AgentConfig, AgentDefinition, ToolDefinition, TodoItem, PermissionLevel, etc.) |
| `agents.ts` | Agent 定义加载 (从 .agents/agents/*.md + 内置 4 个)，支持 tools/model 字段 |
| `rules.ts` | 三层规则合并 (global/project/skill) |
| `commands.ts` | 9 个 slash commands |
| `contextCompaction.ts` | 3 种压缩策略 (summary/token-budget/none) |
| `subagent.ts` | 子 agent spawning (explore/general/plan)，支持 isolated runtime 和 structured result |
| `tools.ts` | 工具定义 + allowlist/denylist 过滤 |
| `todo.ts` | Todo 管理 (pending/in_progress/done/blocked，支持 subtask 和 dependency) |

## Testing

- `npm test` — 52 tests (permissions engine + todo + hierarchical permission)
