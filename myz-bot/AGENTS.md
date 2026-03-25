# myz-bot Agent Guide

## Build
- Entry: `src/cli.ts`
- Bundle: `vite build` -> `dist/myz-bot.cjs` (single file)
- Dist prep: `scripts/prepare-dist.mjs` creates `dist/package.json` with `bin`

## Commands
- `serve`: start bot (default)
- `init`: generate `bot.yml`, `SOUL.md`, `AGENTS.md`, `BOOTSTRAP.md`, and work dirs
- `check`: validate Telegram + LLM connectivity
- `test`: run `node --import tsx --test tests/*.test.ts`
- `serve --config /abs/path/to/bot.yml`: start with an explicit config file; relative paths inside that config resolve from the config file directory
- `check --config /abs/path/to/bot.yml`: validate a non-default config file
- Admin slash commands include `/permit`, `/soul`, and `/ops`; `/ops` covers runtime status, token usage, memory reset, housekeeping, and restart requests

## Runtime Layout
- `bot.yml`, `SOUL.md`, `AGENTS.md`, and `BOOTSTRAP.md` live in the working directory
- `AGENTS.md` and `BOOTSTRAP.md` are workspace templates for the bot persona itself, distinct from this repository guide
- `conversations/<id>/` stores `metadata.json`, `telegram-history.jsonl`, `llm-history.jsonl`, `llm-trace.jsonl`, `attachments/`, `context/`, `logs/`, per-conversation `workspace/`, plus task state in `tasks.json` and a generated `TODO.md`
- Each conversation directory also gets a `.gitignore` that ignores `workspace/*`, so per-conversation worktrees do not pollute the bot runtime repo by default
- `memory/` stores shared notes plus `conversation-summaries/`
- `.myz/skills/` under the bot root is the default project skill source
- `soul/` stores draft/audit/version history for `SOUL.md`, plus `growth.json` and `growth-events.jsonl` for long-term role reinforcement
- `relationships/` stores `index.json` as the current stable relationship state and `reflections.jsonl` as the raw reflection audit stream used for later archiving
- `permissions/` stores pending permission requests plus approved external-path grants remembered across sessions; grants can be directory-prefix or glob-based
- Skills load from builtin + project sources; allow/deny lists are enforced from `bot.yml`
- Telegram/LLM requests both use retry settings from `bot.yml`
- Shared HTTP timeout/keep-alive behavior is configured under `bot.yml -> network`; if a proxy is needed, set `network.proxyUrl` explicitly and it will apply process-wide to Telegram plus LLM fetches
- Background scheduler uses `bot.yml.scheduler` and re-enters the original conversation/thread when due tasks fire
- User-visible tool progress updates are delivered during long tool chains and recorded in `telegram-history.jsonl` as `progress`; these updates should read like natural assistant dialogue rather than fixed status banners, and they are intentionally excluded from reflection / chronicle / recovery inputs
- `telegram-history.jsonl` is the factual source for growth, relationship, and SOUL auto-draft reflections; `context/reflections.json` stores per-conversation Telegram message watermarks rather than visible-message offsets
- `context/chat-chronicle.md` is the bounded long-term conversation chronicle derived from Telegram history; it is meant for durable context, not verbatim replay
- `context/recovered-context.json` caches LLM-selected cross-layer recovery context when runtime history is thin; candidates are pulled from chronicle, summaries, growth, relationships, memories, and recent archives
- `llm-trace.jsonl` holds tool audit / tool response traces so runtime prompt history can be compressed without dragging tool noise forward
- Context compression rewrites `llm-history.jsonl`, archives dropped runtime messages under `context/archive/`, excludes tool traces from summaries, and respects a cooldown to avoid repeated compressions in the same short window
- Ops housekeeping also archives live `llm-history.jsonl` / `llm-trace.jsonl` into `context/archive/` and resets `context/recovered-context.json`, but it intentionally preserves `telegram-history.jsonl`, task state, and metadata
- Live `llm-history.jsonl` keeps tool responses until a compression rewrite happens; tool responses are dropped only during compression so the model does not lose just-executed tool outcomes in normal turns
- Role growth is a separate layer from `SOUL.md`: user praise/critique updates growth state first, and auto-draft absorbs it gradually under continuity constraints
- SOUL draft creation/apply is serialized process-wide and audited in `soul/audit.jsonl` to reduce cross-conversation overwrite races; prompt-visible SOUL content is compacted to stay bounded instead of growing without limit
- `soul/growth.json` is the current growth state, while `soul/growth-events.jsonl` is the recent raw event stream; older events are rolled into `soul/archive/`
- `relationships/index.json` is the current relationship state, while `relationships/reflections.jsonl` is the recent raw reflection stream; older entries are rolled into `relationships/archive/`
- Cross-layer recovery should stay LLM-led: code gathers candidate long-term materials, but the model decides which parts are relevant to the current turn and compresses them into prompt-ready context
- External path escalation is admin-mediated: when a tool needs access outside the normal workspace, it creates a permission request and waits for `/permit approve <requestId>` before retrying; admins can also grant broader reusable rules with `/permit grant <read|write|run> <path-or-glob>` and revoke them later
- Compression summaries only retain visible conversation turns; tool responses and tool-audit traces are excluded from archived summaries
- Local tools can list known contacts and relay a message to an existing private-contact conversation, but the relay is always marked as a bot-mediated transfer rather than impersonating the requester
- Virtual tool paths are intentionally simple: `/bot` is the bot root, `/workspace` is the current conversation workspace, and `memory/`, `conversations/`, `soul/`, `relationships/`, `permissions/`, and `.myz/skills/` all live under `/bot`
