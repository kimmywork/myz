# myz-agent Agent Guide

## Package Architecture

```
@myz/agent-providers → @myz/agent-core → @myz/agent-tui → myz-agent (CLI)
```

- `agent-providers`: 5 LLM adapters (openai_compatible/openai_responses/anthropic/gemini/mistral)
- `agent-core`: agent loop + extensions + permissions + tools + context compaction + rules + commands + subagent + agent definitions
- `agent-tui`: Ink 7 + React 19 TUI components
- `myz-agent`: CLI entry + config loading + browser tools + skills

## myz-agent Source Files

- `cli.ts` — CLI entry point (Commander + Ink TUI integration)
- `config.ts` — YAML config loading (~/.myz/myz.yml + .agents/myz.yml)
- `index.ts` — Thin runtime layer: creates agent-core runtime, wires LLM client, handles slash commands
- `browser/` — Playwright browser tools
- `skills.ts` — Skill source management

## Commands

- `myz-agent [-w <workspace>]` — Start the agent
- `myz-agent --no-tui` — Headless mode (stdin/stdout)

## Config

- Global: `~/.myz/myz.yml` (multi-provider/model registry)
- Workspace: `<workspace>/.agents/myz.yml` (overrides global)
- MCP: `<workspace>/.agents/myz/mcp.yml`
- Agent definitions: `<workspace>/.agents/agents/*.md`
- Skills: `<workspace>/.agents/skills/*/SKILL.md`

## Testing

- `npm test` — runs tests in tests/
- Agent-core tests: `cd packages/agent-core && npm test`
