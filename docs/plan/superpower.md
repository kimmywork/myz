# Superpower Mode Implementation Plan

## Purpose
Introduce Superpower Mode for the Conversation Agent. When enabled, the agent gains advanced tools (tab control, DOM actions, contextual page access) and a PDCA-style workflow using Planner → Plan Review → Task Manager → Execution → Validator. This document is the source of truth for plan, roadmap, detailed design, and implementation logs.

## Goals
- Add **Superpower Mode** toggle in Conversation Agent settings (Dashboard).
- Add **Planner + Plan Review** separation to enforce clear, verifiable plans.
- Add **per-session Task Manager** that supports dependencies, ownership, and deliverable artifacts.
- Add **role-based execution** (research, automation, review) with tool gating.
- Add **Validator Agent** that runs only after tasks complete and plan review passes.
- Add **Execution entry / resume** controls in Sidepanel.
- Gate advanced tools and task/agent flows behind Superpower Mode.
- Provide Sidepanel UI for task progress, validation status, and plan review status.
- Expand provider support (Responses API, Gemini, Anthropic, Moonshot, Qwen, Ollama, vLLM, llama.cpp) with provider-specific settings, model listing, connection testing, and runtime clients.

## Non-Goals (for this iteration)
- No cross-session task persistence beyond conversation metadata.
- No new backend services.
- No changes to existing non-AI features unrelated to Superpower Mode.

## PDCA Mapping
- **Plan**: Planner creates task breakdown + deliverables.
- **Review**: Plan Review agent validates plan quality and verifiability.
- **Do**: Executor runs tasks and records deliverables.
- **Check**: Validator verifies against user expectations + deliverables.
- **Act**: If validation fails, return to execution for targeted fixes.

## Architecture Overview
### New/Updated Components
- **Settings**: add `aiAgents.conversation.superpowerMode` boolean.
- **Planner**: produces structured plan with dependencies and deliverables (no clarifying mode).
- **Plan Review Agent**: validates plan structure, missing info, and testability.
- **Task Manager v2**: per-session task graph stored in conversation metadata.
- **Role Router**: assigns tasks to lightweight roles (research, automation, review).
- **Validator Agent**: validates only after all tasks complete and plan review passes.
- **Superpower Tools**: tab list, activate tab, DOM actions, page context, eval.
- **Execution Entry / Resume**: explicit UI controls to begin or continue task plan.
- **Sidepanel Task Panel**: visual progress, plan review state, validation state.

### Data Model (Conversation metadata)
```
{ 
  taskPlan: {
    id: string,
    status: "planning" | "reviewing" | "needs_revision" | "executing" | "done" | "validating" | "validated" | "needs_rework",
    originalUserRequest: string,
    mode: "quick" | "orchestrated",
    assumptions: string[],
    tasks: [
      {
        id: string,
        title: string,
        status: "pending" | "in_progress" | "done" | "blocked",
        priority: "low" | "medium" | "high",
        owner: "planner" | "executor" | "research" | "automation" | "review",
        blockedBy: string[],
        blocks: string[],
        category: "quick" | "research" | "automation" | "reasoning",
        skills: string[],
        deliverables: [
          {
            id: string,
            description: string,
            status: "pending" | "done",
            artifacts: Array<{ type: string, payload: unknown }>
          }
        ]
      }
    ],
    currentTaskId: string | null,
    planReview: {
      status: "pending" | "pass" | "needs_revision",
      issues: string[],
      missingInfo: string[]
    },
    validation: {
      status: "pending" | "pass" | "fail",
      expectationScore: number,
      deliverableScore: number,
      issues: string[],
      missingDeliverables: string[]
    },
    createdAt: string,
    updatedAt: string
  }
}
```

## Tooling Plan
### New Local Tools (Superpower-gated)
> Superpower 模式下会使用设置中启用的本地工具清单（排除 `SelectTools`），并额外开放以下浏览器自动化工具。
- `Task` (action: init/get/list/update/attach/complete_all)
- `PromptingAgent`
- `ListTabs`
- `ActivateTab`
- `GotoPage`
- `NewTab`
- `RunDomActions`
- `GetPageContext`
- `EvalInPage`

### Tool Gating
- Tools above are exposed only when Superpower Mode is enabled.
- Planner: only `Task` (action: init)（工具调用在计划阶段默认关闭）。
- Plan Review: read-only `Task` (action: get)（工具调用在审核阶段默认关闭）。
- Executor: all task + superpower tools.
- Research: `Task`, `GetPageContext`, `ListTabs`, `Read`, `Glob`, `WebSearch`, `WebFetch`.
- Automation: `Task`, `ListTabs`, `ActivateTab`, `GotoPage`, `NewTab`, `RunDomActions`, `EvalInPage`, `GetPageContext`.
- Validator: read-only `Task` (action: get).

## Agent Behavior
### Planner
- Does not open clarifying mode; missing info becomes pre-tasks.
- Output JSON plan with dependencies and deliverables.

### Plan Review
- Validates plan for verifiability, missing info, and scope creep.
- Returns pass/needs_revision with actionable issues.

### Executor (Conversation Agent)
- Executes tasks in order, attaches deliverables, updates task status.
- May spawn lightweight role tasks by assigning `owner` and `category`.
- Must maintain task progress via tools (not just text).

### Validator
- Runs only after all tasks `done`.
- Validation standard: 50% user expectation + 50% deliverables completion.
- Returns pass/fail JSON with issues and required fixes.

## UI/UX Plan
- **Dashboard**: add Superpower Mode checkbox in Conversation Agent settings.
- **Sidepanel**: task plan panel (visible only when Superpower Mode + taskPlan exists).
- **Plan Review**: show plan review status + issues; allow "revise plan" action.
- **Execution Entry**: "Start work" / "Resume work" actions.
- **Validation State**: show pass/fail + missing deliverables.
- **Role & Category Badges**: show owner/category/skills per task.

## Roadmap (Phased)
### Phase 1 (v1, complete)
1. Settings schema + defaults + normalization for `superpowerMode`.
2. Task Manager module + task plan storage helpers.
3. Planning Agent + Validator Agent.
4. Background message handlers (plan/validate flows).
5. Superpower tools (background + content handlers).
6. Tool allowlist gating by Superpower Mode.
7. Sidepanel Task Plan store + UI panel.
8. Prompt adjustments to enforce task tool usage.
9. Multi-provider expansion (Responses API + Gemini/Anthropic/Moonshot/Qwen/Ollama/vLLM/llama.cpp).

### Phase 2 (v2, complete)
1. Task Manager v2 (dependencies, owner, category, artifacts).
2. Plan Review agent + quality gate.
3. Role router + lightweight subagent prompts.
4. Execution entry/resume UI + status sync.
5. Category + skill selection and tool gating.
6. Guardrails hooks (pre/post tool, missing deliverables).
7. QA / manual validation + targeted tests.

## Progress Tracker
### Phase 1
- [x] 1. Settings schema + defaults + normalization
- [x] 2. Task Manager module
- [x] 3. Planning Agent + Validator Agent
- [x] 4. Background message handlers
- [x] 5. Superpower tools + content handlers
- [x] 6. Tool allowlist gating
- [x] 7. Sidepanel Task Plan store + UI panel
- [x] 8. Prompt adjustments
- [x] 9. QA / manual validation（覆盖关键单测，人工验证持续中）
- [x] 10. Multi-provider expansion (providers, UI, runtime, tests)

### Phase 2
- [x] 1. Task Manager v2 (dependencies, owner, category, artifacts)
- [x] 2. Plan Review agent + quality gate
- [x] 3. Role router + lightweight subagent prompts
- [x] 4. Execution entry/resume UI + status sync
- [x] 5. Category + skill selection and tool gating
- [x] 6. Guardrails hooks (pre/post tool, missing deliverables)
- [x] 7. QA / manual validation + targeted tests

## Detailed Design (Expanded)
### Design Principles
- Separation of planning, execution, and validation to avoid goal drift.
- Task state is the single source of truth; prompts reflect current task only.
- Minimal tool exposure per role to reduce accidental actions.
- Browser context is expensive; capture only when needed and compress artifacts.

### Mode Selection
- **Quick**: Single pass plan + execute; best for 1-3 steps and no dependencies.
- **Orchestrated**: Planner → Plan Review → Executor → Validator. Required when task count > 3 or dependencies exist.

### QuickStart (一键执行)
- 默认启用，无需额外关键词；`ulw` / `ultrawork` 仍会被清理掉。
- 使用 QuickStart Agent：不提问，默认合理假设并写入 `assumptions`，或转为前置任务。
- Plan Review 失败时自动重写计划并插入前置任务；最终强制通过并自动开始执行。

### Role Matrix
- **Planner**: plan only; `Task.init`.
- **Plan Review**: plan QA; `Task.get`.
- **Research**: read-only discovery; `Task` + `Read` + `GetPageContext` + `ListTabs` + `Glob`.
- **Automation**: DOM actions; `Task` + `RunDomActions` + `EvalInPage` + `ActivateTab`.
- **Executor**: owns orchestration; all Superpower tools.
- **Validator**: final verification; `Task.get` only.

### State Machine
```
planning -> reviewing -> executing -> done -> validating -> validated
                         |                    |
                         |                    -> needs_rework -> executing
                         -> needs_revision -> planning
```
- `planning -> reviewing`: Planner writes taskPlan.
- `reviewing -> executing`: Plan Review passes.
- `reviewing -> needs_revision`: Plan Review fails; Planner revises.
- `executing -> done`: all tasks complete.
- `done -> validating`: validator runs.
- `validating -> needs_rework`: validation fails.
- `needs_rework -> executing`: executor resumes targeted fixes.

### Task Flow
1. Planner creates task graph with dependencies and deliverables.
2. Plan Review validates plan, updates `planReview.status`.
3. Executor picks unblocked tasks and assigns `owner/category/skills`.
4. Execution updates deliverables + artifacts on completion.
5. Validator runs when all tasks done and review passed.

### Task Manager v2
- **Schema guarantees**
  - 依赖在初始化时会被规范化；检测到循环依赖会自动断开冲突边。
  - Each task has at least one deliverable.
  - Each deliverable has an `artifacts` array (can be empty).
- **Task selection**
  - `Task.list` returns tasks with `blockedBy.length === 0` and `status !== done`.
  - Executor picks highest priority first.
- **Artifacts**
  - `type` values: `page-context`, `screenshot`, `dom-html`, `url`, `note`, `json`.
  - Artifact payloads 统一限制在 32KB（超过会被截断并标记 `truncated`）。

### Task Tool Schema (v2)
**Tool name**: `Task`

**Actions**
- `init`: create a new taskPlan.
- `get`: fetch current taskPlan.
- `list`: list unblocked tasks.
- `update`: update task or plan fields.
- `attach`: attach deliverable artifacts.
- `complete_all`: mark all tasks done.

**Shared fields (top-level or inside payload)**
```
{
  "action": "init" | "get" | "list" | "update" | "attach" | "complete_all",
  "payload": { ... } // 可选，若提供则优先使用
}
```

**TaskPlan Schema**
```
{
  "id": "tp-uuid",
  "status": "planning" | "reviewing" | "needs_revision" | "executing" | "done" | "validating" | "validated" | "needs_rework",
  "mode": "quick" | "orchestrated",
  "originalUserRequest": "string",
  "assumptions": ["string"],
  "currentTaskId": "t-1" | null,
  "tasks": [Task],
  "planReview": PlanReviewStatus,
  "validation": ValidationStatus,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

**Task Schema**
```
{
  "id": "t-1",
  "title": "string",
  "status": "pending" | "in_progress" | "done" | "blocked",
  "priority": "low" | "medium" | "high",
  "owner": "planner" | "executor" | "research" | "automation" | "review",
  "blockedBy": ["t-2" | "2" | "任务标题"],
  "blocks": ["t-3" | "3" | "任务标题"],
  "category": "quick" | "research" | "automation" | "reasoning",
  "skills": ["browser-ops"],
  "deliverables": [Deliverable]
}
```

**Deliverable Schema**
```
{
  "id": "d-1",
  "description": "string",
  "status": "pending" | "done",
  "artifacts": [Artifact]
}
```

**Artifact Schema**
```
{
  "type": "page-context" | "screenshot" | "dom-html" | "url" | "note" | "json",
  "payload": "string | object"
}
```

**Plan Review Schema**
```
{
  "status": "pending" | "pass" | "needs_revision",
  "issues": ["string"],
  "missingInfo": ["string"]
}
```

**Validation Schema**
```
{
  "status": "pending" | "pass" | "fail",
  "expectationScore": 0,
  "deliverableScore": 0,
  "issues": ["string"],
  "missingDeliverables": ["string"]
}
```

**Action payloads**
```
// init (支持 assumptions，可直接放在顶层或 payload 内)
{
  "action": "init",
  "payload": {
    "mode": "quick" | "orchestrated",
    "originalUserRequest": "string",
    "assumptions": ["string"],
    "tasks": [Task]
  }
}

// get
{ "action": "get", "payload": {} }

// list
{
  "action": "list",
  "payload": {
    "onlyUnblocked": true,
    "status": ["pending", "in_progress"]
  }
}

// update
{
  "action": "update",
  "payload": {
    "taskId": "t-1",
    "patch": { "status": "in_progress", "owner": "automation" }
  }
}

// attach
{
  "action": "attach",
  "payload": {
    "taskId": "t-1",
    "deliverableId": "d-1",
    "artifacts": [{ "type": "note", "payload": "string" }]
  }
}

// complete_all
{ "action": "complete_all", "payload": { "reason": "string", "role": "validator" } }
```

**Validation rules**
- `update` cannot skip directly from `pending` to `done` if deliverables are empty.
- `attach` 默认将 deliverable 标记为 `done`；当全部 deliverables 完成时，任务也会被标记为 `done`。
- `complete_all` 需要 `reason` 且 `role=validator`。

### PromptingAgent Tool
- 面向主 Agent 的一次性子任务代理：自动组装提示词，可选择工具与技能并返回结果。
- 适用于重写文本/JSON、一次性生成内容、轻量探索，不做长链路对话。

**Input**
```
{
  "prompt": "string (required)",
  "system": "string (optional)",
  "toolNames": ["ToolA", "ToolB"],
  "skillNames": ["skill-a"],
  "outputFormat": "text" | "json",
  "maxOutputTokens": 64-2048
}
```

**Output (tool data)**
```
{
  "output": "string",
  "usedTools": ["ToolA"],
  "skillNames": ["skill-a"]
}
```

### Planner Output Contract
Planner returns JSON only (id 可省略；blockedBy/blocks 可用任务序号或标题):
```
{
  "mode": "quick",
  "assumptions": ["..."],
  "tasks": [
    {
      "title": "Scan current page state",
      "priority": "high",
      "owner": "research",
      "blockedBy": [],
      "blocks": ["2"],
      "category": "research",
      "skills": ["browser-ops"],
      "deliverables": [
        { "description": "Page summary + key selectors", "artifacts": [] }
      ]
    }
  ]
}
```

### Plan Review Output Contract
Plan Review returns JSON only:
```
{
  "status": "needs_revision",
  "issues": ["Task 2 deliverable not verifiable", "Missing dependency for login flow"],
  "missingInfo": ["Target site URL", "Desired acceptance criteria"]
}
```

### Category + Skill Routing (现状)
- 基于 category 做执行期温度与工具白名单调整（模型不切换）。
- Superpower 模式下默认注入全部技能，技能选择与 tool selection 不生效（可通过 Read 访问 /skills）。
- `category/skills` 主要用于任务标注与展示。

### Role Routing Heuristics (现状)
- 角色由 Planner/人工指定；暂无自动路由器基于描述推断。

### Execution Entry / Resume
- Sidepanel offers **Start Work** when plan is ready（非 QuickStart 自动执行时）。
- QuickStart 默认自动开始执行并自动推进。
- If execution stopped, **Resume Work** rehydrates `currentTaskId`.
- Resume uses `Task.list` to find the next unblocked task if `currentTaskId` is invalid.

### UI States (Sidepanel)
- **Plan Ready**: plan summary + Plan Review status + Start Work.
- **Executing**: task list with owner/category badges; current task pinned.
- **Validating**: read-only status; results only when validator completes.
- **Needs Rework**: highlights failed deliverables + Resume Work.

### Plan Review Checklist
- Missing context becomes pre-tasks.
- Each task has a verifiable deliverable.
- Dependencies are explicit and minimal.
- Scope matches original request.

### Guardrails (现状)
- 角色工具白名单在执行阶段生效（按任务 owner 过滤）。
- `Task.get` 目前是提示层要求，未做硬性拦截。
- 未实现自动 artifact 归集（仍需显式 Task.attach）。
- Auto-continue 最多 4 轮，若检测到仍有待办任务会继续。

### Current Gaps / Not Implemented Yet
- 暂无（已完成当前列表项）。

### 角色 Prompt 模板（系统提示）
用于各角色系统提示，需保持简洁、可执行、仅输出指定格式。

**Planner**
```
你是 Planner。只输出 JSON。
规则：
- 不进入澄清模式；缺信息转为前置任务。
- 需要顺序时写依赖。
- 每个任务至少一个交付物。
- blockedBy/blocks 使用任务序号或标题，不要自造 ID。
- 按交付物类型设置 owner/category/skills。
输出：任务计划 JSON（不是自然语言）。
```

**Plan Review**
```
你是 Plan Review。只输出 JSON。
检查：
- 交付物可验证。
- 依赖清晰且最少化。
- 缺信息已转为前置任务。
- 范围与原始需求一致。
若 needs_revision，必须至少给出 issues 或 missingInfo。
返回：{ status, issues, missingInfo }。
```

**Executor**
```
你是 Executor。严格按任务计划执行。
规则：
- 先调用 Task.get。
- 一次只做一个未阻塞任务。
- 仅使用角色允许的工具。
- 工具后必须 Task.attach 交付物。
- 交付物满足后再标记 done。
- 默认做合理假设并继续，只有账号/权限/高风险操作才提问。
- 可调用 PromptingAgent 处理一次性子任务。
```

**Research**
```
你是 Research（只读）。
规则：
- 仅用 GetPageContext/ListTabs/Read/Glob/WebSearch/WebFetch。
- 只输出发现与证据，附加 note 类型 artifacts。
- 不做 DOM 操作或写入。
```

**Automation**
```
你是 Automation（DOM 执行）。
规则：
- 仅用 ListTabs/ActivateTab/GotoPage/NewTab/RunDomActions/EvalInPage。
- 必要时抓取证据（dom-html/url/screenshot）。
- 不做分析与规划。
```

**Validator**
```
你是 Validator。只输出 JSON。
规则：
- 仅在任务完成且 Plan Review 通过后运行。
- expectationScore 与 deliverableScore 各 0-100。
- 失败必须列出 issues 与 missingDeliverables。
返回：{ status, expectationScore, deliverableScore, issues, missingDeliverables }。
```

## Implementation Log
- 2026-02-04: Created initial plan and tracking document.
- 2026-02-04: Added `superpowerMode` to settings schema, defaults, and normalization.
- 2026-02-04: Added task plan manager module with plan/status/deliverable helpers.
- 2026-02-04: Added Planning Agent and Validator Agent implementations.
- 2026-02-04: Added background message handlers for planning/validation flows.
- 2026-02-04: Added task/superpower local tools and content DOM action handler.
- 2026-02-04: Added Superpower tool allowlist gating in AI message handler.
- 2026-02-04: Added Sidepanel task plan store and UI panel.
- 2026-02-04: Added task plan prompt injection to Conversation Agent.
- 2026-02-04: Added Superpower Mode toggle in Conversation settings UI.
- 2026-02-04: Added planning flow + auto-validation triggers in Sidepanel chat flow.
- 2026-02-04: Superpower Mode now bypasses tool/skill selection agents and injects all enabled tools/skills.
- 2026-02-04: Merged Superpower task plan prompt into the main system prompt (single system message).
- 2026-02-04: Expanded Planning Agent prompt with extension context and capabilities.
- 2026-02-04: Added Superpower instruction to require real tool calls (no verbal-only tool intent).
- 2026-02-04: Added tool-data payloads to Superpower/task tool outputs so tool results reach the agent.
- 2026-02-04: Moved Planning Agent context/rules/format guidance into user prompt.
- 2026-02-04: Added developer role support and remapped system to developer for GPT-4+ / gpt-o1 models in OpenAI-compatible client.
- 2026-02-04: Added collapsible task list (default current task only) and streaming role mapping for developer role.
- 2026-02-04: Disabled streaming only for Superpower requests and ensured non-stream replies close loading state.
- 2026-02-04: Started multi-provider expansion (Responses API, Gemini, Anthropic, Moonshot, Qwen, Ollama, vLLM, llama.cpp).
- 2026-02-04: Added provider type catalog + UI selector, base URL defaults, and type-aware test gating.
- 2026-02-04: Implemented provider registry + runtime session switcher for OpenAI Responses, Gemini, Anthropic, Ollama, and OpenAI-compatible variants (Moonshot/Qwen/vLLM/llama.cpp).
- 2026-02-04: Added model list + connection test handlers per provider type (Gemini/Anthropic/Ollama/custom).
- 2026-02-04: Added Qwen reasoning toggle capability and OpenAI Responses/Gemini/Anthropic/Ollama API clients.
- 2026-02-05: Added providers AGENTS guide and documented provider details/links in `docs/knowledges/llm-providers.md`.
- 2026-02-05: Planning Agent now carries forward original request + clarify Q/A history during clarification turns.
- 2026-02-05: Fixed OpenAI Responses tool schema mapping (tools[].name/parameters) to resolve missing tool name errors.
- 2026-02-05: Added defensive tool-definition filtering for Responses/Gemini/Anthropic adapters.
- 2026-02-05: Extended OpenAI Responses tool-call parsing to handle `tool_call`/`function_call` variants.
- 2026-02-05: Added per-model tool_choice / strict / parallel_tool_calls settings with UI controls and provider mappings.
- 2026-02-05: Extended RunDomActions with truncate flag, captureViewport, queryViewport, and elementFromPoint actions.
- 2026-02-05: Added XPath selector support in RunDomActions and returned XPath for element-based results.
- 2026-02-05: Added EvalInPage tool to execute JS in content context with serialized results.
- 2026-02-05: Switched EvalInPage to chrome.scripting.executeScript (MAIN world) to bypass extension CSP; added scripting permission.
- 2026-02-05: Added Superpower auto-continue loop with task-aware continuation prompt and enabled Responses API streaming in Superpower mode.
- 2026-02-05: Removed Planning Agent clarify output; missing info becomes pre-tasks and planning always returns a plan.
- 2026-02-05: Removed all clarify-status fields and UI from task plan flow (no clarify interactions).
- 2026-02-05: Adjusted Planning Agent prompt to minimize clarifying questions by adding pre-tasks for missing info.
- 2026-02-05: Renamed standard tools to Claude-compatible names (Read/Write/Edit/Glob/List/WebSearch/WebFetch/Task) and added Glob/Edit/Task routing.
- 2026-02-05: Added browser-operations builtin skill and updated Superpower system prompt with browser tool guidance.
- 2026-02-05: Renamed browser tools to CodeExecution/ListTabs/ActivateTab/GetPageContext/RunDomActions/EvalInPage/SelectTools; RunDomActions defaults to no truncation, supports batch, and query/queryViewport return xpath-only.
- 2026-02-05: Task 工具不再要求模型提供 conversationId；由运行时注入会话上下文且不暴露给模型。
- 2026-02-05: 修复 OpenAI Responses SSE 流式增量，改为推送累计内容以匹配前端流式聚合逻辑。
- 2026-02-05: captureViewport 截图默认缩放到视口 1/2 并重编码（默认 jpeg）以减少上下文体积。
- 2026-02-05: captureViewport 仅支持 jpeg；普通屏缩放约 0.4，高分屏缩放至 0.25。
- 2026-02-05: Superpower system prompt 增加截图高上下文占用提醒，建议仅必要时使用。
- 2026-02-05: Auto-continue 逻辑改为基于任务未完成自动推进（结合工具调用/理由文本），以适配流式输出。
- 2026-02-05: RunDomActions 点击改为派发鼠标/指针事件序列（必要时回退 .click），提升在受限页面的触发效果。
- 2026-02-05: RunDomActions 输入改为模拟鼠标/键盘事件；新增 keypress 动作支持组合按键。
- 2026-02-05: RunDomActions getHtml 返回清理后的 HTML（移除 script/style 标签与 style/on* 属性）。
- 2026-02-05: Conversation system prompt 强制遵循任务计划，并要求仅在必要时使用 [REQUIRE_USER_INPUT] 提问。
- 2026-02-05: Task 计划提示强调先调用 Task.get 获取完整任务列表后再执行。
- 2026-02-05: Task.get 强制后不再在 system prompt 中内嵌任务计划概要。
- 2026-02-05: Superpower 新增 GotoPage / NewTab 工具用于当前页跳转与新标签页打开。
- 2026-02-05: Planning Agent prompt 注入当前地区（中国上海）、语言（zh-Hans-CN）与时间信息。
- 2026-02-05: Conversation Agent 每次用户请求附加任务执行指令（含原始请求/当前任务），并在 Superpower 模式禁用技能列表注入。
- 2026-02-05: Superpower system prompt 明确默认启用全部技能（通过 Read 访问 /skills/）。
- 2026-02-05: Superpower system prompt 改为注入完整 skillList（available_skills 块），避免在用户消息中注入。
- 2026-02-06: Updated plan + roadmap for v2 (role matrix, plan review, task graph, execution entry/resume).
- 2026-02-06: Added Task v2 schema + Chinese role prompt templates (concise, execution-first).
- 2026-02-06: Added QuickStart Agent and default one-line auto execution (no ulw keyword).
- 2026-02-06: Added Plan Review auto-rewrite + preflight task fallback to reduce user input.
- 2026-02-06: Added PromptingAgent tool for one-off sub tasks with auto tool/skill selection.
- 2026-02-06: Fixed task dependency resolution for blockedBy/blocks using indices/titles.
- 2026-02-06: Added Sidepanel plan start/resume UX polish and updated unit tests (task tool, plan review, task manager, records/import).
- 2026-02-09: Added dependency cycle breaking, artifact size truncation, category-based temperature/tool routing, complete_all guards, and auto validation trigger on task updates.
