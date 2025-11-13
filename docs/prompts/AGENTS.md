# Prompt Histories

Here is a list of prompt history files, contains most of the input I feeded to Agents.

## Filename Pattern

File name pattern is `<date in YYYY-mm-dd>_<sequence number of the day>_<short-description-joined-with-dashes>.md`

For example first 5 entries:

- 2025-10-24_01_chrome-extension.md
- 2025-10-27_01_service.md
- 2025-10-27_02_plugin-enhancement.md
- 2025-10-28_01_extension-new-feature.md
- 2025-10-28_02_migrate-to-vue.md

## File format

### Frontmatter

Frontmatter contains some metadata for the agent prompts, including agent type, llm model and date.

E.g.:

```yaml
---
agent: Copilot
model: GPT-5-Codex
date: 2025-10-31
---
```

### Agents

Agents can be everything that is accessible from anywhere, including IDE agents (Cursor, Cline, Copilot etc.) and CLI agents (Claude Code, Codex, Kimi-CLI etc.).

Here is list of agents I used:
- Copilot
- Codex
- Claude Code
- Kimi
- Gemini

### Models

Models may be varies, because some of the agents can be configured through environment variables, or choose different models (including BYOK model).

Typically chould be:

- GPT-5 High/Low/Codex
- Claude Sonnet 4.5
- Claude Haiku 4.5
- Deepseek V3.2
- Kimi K2 thinking
- kimi-for-coding (subscription model)

### Prompt format

Prompts are seperated by `---` (i,e, `<hr />` in HTML), and using standard markdown format.
