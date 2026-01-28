# Agent Skills Guide

This folder defines the **Agent Skills** layer used by the AI assistant in the MV3 background worker.

## Overview

Skills are instruction bundles (mostly `SKILL.md`) that can be:

- **Imported by users** (stored in IndexedDB)
- **Built-in** (bundled in source, then seeded into IndexedDB on first use)

The runtime injects selected skill content into user messages before model calls.

## Storage & runtime flow

### IndexedDB

- DB: `MyZAgentSkillsDB`
- Stores:
  - `skills` (metadata)
  - `skill_files` (file contents)

Implementations:

- `storage.ts` handles list/get/update/import/delete.
- Built-in skills are seeded by `ensureBuiltinSkills()` on first access.

### Skill selection

Two ways to select skills for a user message:

1. **Explicit mention**: `@skill-name` in chat input
2. **Auto selection** (optional): a dedicated selector model chooses skills

Selector agent:

- `agents/skillSelectionAgent.ts`
- Outputs JSON `{ "skill_names": [...] }`

The final skill context is injected in:

- `ai/prompt/conversation.ts` → appended as `技能说明:\n...`

Note: `allowed-tools` is stored but not enforced; tools still follow normal allowlists.

## Built-in skills (how to add)

1. **Create the skill file**
   - Add a folder under `myz-annotator/src/skills/builtin/<skill-name>/`
   - Add `SKILL.md` with YAML frontmatter (`name`, `description`, optional metadata)

2. **Register the skill**
   - Edit `myz-annotator/src/background/ai/skills/builtins.ts`
   - Import the SKILL.md as raw text:
     - `import mySkill from "@/skills/builtin/<skill-name>/SKILL.md?raw"`
   - Append to `BUILTIN_SKILL_SOURCES`

3. **Build + verify**
   - The skill is seeded into IndexedDB the first time skills are accessed.
   - Built-in skills are marked `builtin: true`.
   - Built-in skills **cannot be deleted**, but can be enabled/disabled.

## Importing user skills

User skills are imported via the Dashboard (zip or folder):

- `myz:importSkills` in `messages/skills.ts`
- `storage.importSkill()` validates SKILL.md and persists files.

### Validation rules (SKILL.md)

- `name`: lowercase letters/digits/hyphen, 1-64 chars
- `description`: required, <= 1024 chars
- `compatibility`: optional, <= 500 chars

## Editing skills

The Dashboard editor can update UTF-8 files:

- `myz:updateSkillFile` validates SKILL.md frontmatter
- Skill `name` is immutable

Binary files are stored as base64 and are read-only in the editor.
