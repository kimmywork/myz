# Superpower Main-Dialog Planning Refactor

## Vision

Superpower mode must stop delegating planning/review/validation to separate subagents. The same main conversation must keep the full context, create the task plan, execute it, revise it, and decide when it is complete.

## Scope

- Simplify built-in skills to keep only `browser-operations`
- Replace subagent-based planning flow with a main-dialog Planning Mode skill
- Redefine task plan schema around lightweight task progress instead of deliverable artifacts
- Simplify sidepanel task UI to reflect the new task model
- Align `myz-bot` references with the reduced built-in skill set

## Non-Goals

- No new provider work
- No new external compatibility layer for planning
- No migration of old stored conversations beyond tolerant normalization

## Data Model

New task plan shape:

- `TaskPlan.status`: `planning | executing | blocked | done`
- `TaskPlan.goal`: original request / current target
- `TaskPlan.assumptions`: optional assumptions
- `TaskPlan.summary`: optional plan-level progress summary
- `TaskPlan.outcome`: optional completion outcome
- `TaskPlan.tasks[]`:
  - `id`
  - `title`
  - `status`: `pending | in_progress | blocked | done`
  - `priority`
  - `owner`
  - `category`
  - `skills`
  - `blockedBy`
  - `blocks`
  - `summary`
  - `notes[]`
  - `outcome`

Removed from the active model:

- `planReview`
- `validation`
- `deliverables`
- `artifacts`
- review/validator gating as completion criteria

Backward compatibility:

- Old plans must still normalize successfully
- Old `deliverables` / `artifacts` should be folded into `summary` / `notes`
- Old `originalUserRequest` should normalize into `goal`

## Prompt / Workflow

Superpower mode must use an internal Planning Mode skill in the main conversation:

1. Read existing task state with `Task.get`
2. If no plan exists or the request changed materially, create or rewrite the plan with `Task.init`
3. Keep plans compact and execution-oriented
4. Update progress in place with `Task.update`
5. Decide completion in the main conversation and call `Task.complete_all`
6. Ask the user only when truly blocked, prefixed with `[REQUIRE_USER_INPUT]`

The main system prompt must stay stable and low-volatility. It may only contain a stable rule such as "for complex tasks, read `/skills/planning-mode/SKILL.md` first". Volatile plan state must stay in user turns / task state rather than being appended to the system prompt.

## UX

Sidepanel task panel should:

- Show current plan status and current task
- Show per-task summary / notes / outcome
- Remove review/start/validation control buttons
- Stop presenting review/validation failure states

Chat send flow should:

- Stop pre-calling `myz:aiPlanRequest`
- Stop auto-calling `myz:aiValidateRequest`
- Send the user request directly to the conversation agent

## Acceptance Criteria

- In Superpower mode, no planning/review/validation subagent is called before execution
- The first agent response can create and then execute a task plan inside the same conversation context
- `Task.complete_all` no longer requires validator role or review pass
- Built-in skill seeding leaves only `browser-operations`
- Existing old task plans can still render after normalization
- Sidepanel no longer offers review/start/validation buttons

## Risks

- Existing tests and UI assumptions are tied to `planReview` / `validation`
- Old seeded builtin skills may remain in IndexedDB without explicit cleanup

## Mitigation

- Add tolerant normalization for old task payloads
- Prune removed built-in skills during builtin seeding
- Update tests together with schema and UI changes
