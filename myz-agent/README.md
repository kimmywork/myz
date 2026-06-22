# myz-agent

`myz-agent` is the terminal AI coding agent for the MyZ workspace. It is split into small packages:

```text
@myz/agent-providers → @myz/agent-core → @myz/agent-tui → myz-agent
```

## Packages

- `@myz/agent-providers` — provider-neutral LLM client abstraction with adapters for:
  - `openai_compatible`
  - `openai_responses`
  - `anthropic`
  - `gemini`
  - `mistral`
- `@myz/agent-core` — agent loop, tools, permissions, slash commands, rules, context compaction, subagents, agent definitions.
- `@myz/agent-tui` — Ink-based terminal UI.
- `myz-agent` — CLI entry, config loading, built-in local/browser tools, session persistence.

## Usage

```bash
# Start the Ink TUI in the current workspace
myz-agent

# Start in a specific workspace
myz-agent -w /abs/path/to/workspace

# Headless stdin/stdout mode
myz-agent serve --no-tui -w /abs/path/to/workspace
```

During a session, supported slash commands are:

```text
/help     Show command help
/clear    Clear the current session
/agents   List or switch agents
/model    List or switch models
/fork     Show fork status placeholder
/resume   List resumable sessions
/tools    List registered tools
/context  Show context/token status
/compact  Trigger context compaction when over budget
```

## Configuration

Global config: `~/.myz/myz.yml`

```yaml
providers:
  default:
    type: openai_compatible
    baseUrl: https://api.example.com/v1
    apiKey: ${MYZ_AGENT_API_KEY}
    compatProfile: deepseek
    models:
      - id: deepseek-chat
        contextWindow: 64000
        maxOutputTokens: 4096
        capabilities:
          toolCalling: true
          reasoning: false
          vision: false
defaults:
  provider: default
  model: deepseek-chat
```

Workspace config: `<workspace>/.agents/myz.yml`

```yaml
defaults:
  provider: default
  model: deepseek-chat
permissions:
  - pattern: "Run:rm *"
    action: deny
skills:
  allowlist: []
  denylist: []
browser:
  enabled: true
  headless: true
context:
  strategy: summary
  summaryThresholdRatio: 0.8
  recentWindowRatio: 0.3
  summaryMaxTokens: 2000
```

Environment variables in config values are resolved using `${ENV_VAR}` syntax.

## Agent definitions

Custom agents live in `<workspace>/.agents/agents/*.md`:

```markdown
---
description: Read-only planning agent
mode: primary
model: deepseek-chat
hidden: false
maxSteps: 20
---
You are a planning agent. Analyze and propose changes, but do not edit files.
```

Built-in agents include:

- `build` — primary development agent with full permissions.
- `plan` — primary read-only planning agent.
- `explore` — hidden read-only subagent.
- `general` — general-purpose subagent.

## Sessions

TUI session history is persisted as JSONL under:

```text
~/.myz/workspaces/<workspace-id>/sessions/<session-id>.jsonl
```

## Development

```bash
# Run myz-agent tests
npm test --workspace myz-agent

# Run agent-core tests
npm test --workspace @myz/agent-core

# Run agent-tui tests
npm test --workspace @myz/agent-tui

# Build the CLI bundle
npm run build --workspace myz-agent
```
