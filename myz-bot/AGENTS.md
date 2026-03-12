# myz-bot Agent Guide

## Build
- Entry: `src/cli.ts`
- Bundle: `vite build` -> `dist/myz-bot.cjs` (single file)
- Dist prep: `scripts/prepare-dist.mjs` creates `dist/package.json` with `bin`

## Commands
- `serve`: start bot (default)
- `init`: generate `bot.yml`, `SOUL.md`, and work dirs
- `check`: validate Telegram + LLM connectivity

## Runtime Layout
- `bot.yml` + `SOUL.md` live in the working directory
- `conversations/` and `memory/` are created by `init`
- Skills are read-only from `myz-annotator/src/skills/builtin`
