# @myz/agent-core

核心 agent 运行时包。包含 agent loop、扩展 API、权限引擎、工具系统、上下文压缩、规则、命令、子 agent、agent 定义。

## 依赖链

```
@myz/agent-providers → @myz/agent-core
```

## 模块

| 模块 | 职责 |
|---|---|
| `loop.ts` | Agent loop (LLM → tool call → result → LLM) |
| `extensions.ts` | Extension API (register tool/hook/agent/prompt/command) |
| `permissions.ts` | Glob pattern matching, per-agent override |
| `types.ts` | 所有类型定义 (AgentConfig, AgentDefinition, ToolDefinition, etc.) |
| `agents.ts` | Agent 定义加载 (从 .agents/agents/*.md + 内置 4 个) |
| `rules.ts` | 三层规则合并 (global/project/skill) |
| `commands.ts` | 9 个 slash commands |
| `contextCompaction.ts` | 3 种压缩策略 (summary/token-budget/none) |
| `subagent.ts` | 子 agent spawning (explore/general/plan) |
| `tools.ts` | 工具定义 + allowlist/denylist 过滤 |

## Testing

- `npm test` — 7 tests (permissions engine)
