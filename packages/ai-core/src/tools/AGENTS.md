# Tools (Local + MCP) Guide

This folder defines the **tool layer** used by the AI assistant.
Core tool registry lives in `@myz/ai-core`, while local tool implementations are registered by each environment.

## Overview

MyZ has two kinds of tools:

1. **Local tools** (environment-specific)
   - Browser definitions + handlers live in `myz-annotator/src/background/ai/tools/`.
   - Node tools live in `myz-bot/src/tools.ts`.
   - Registered via `registerLocalTools({ definitions, handlers })`.
2. **MCP tools** (remote tools exposed by MCP servers)
   - Connected via `McpClient` and merged into the tool list at runtime.

Tool listing + execution are centralized in:

- `packages/ai-core/src/tools/registry.ts`

Tool exposure + per-request filtering are handled by:

- `packages/ai-core/src/capabilities/mcp.ts`

## How tools are used at runtime

### 1) Listing tools (what the model can see)

The tool-calling capability asks for available tools each request:

- `providerSession.ts` → `mcp.listTools()` → `registry.listAvailableTools()`

`listAvailableTools()` returns the registered local tools (tagged with `server: "myz-local"`) plus MCP server tools.

### 2) Executing tool calls

When the model returns a tool call:

- The provider tool-loop calls `mcp.executeToolCall(...)`.
- `McpCapability.executeToolCall()` first checks whether the tool is **enabled** for this request.
- If enabled, execution is delegated to `registry.executeToolCall()`:
  - local tools run via `LOCAL_TOOL_HANDLERS[name](args)`
  - MCP tools run via `client.callTool(name, args)`

Important: tool outputs are converted into `role: "tool"` messages and are included in the follow-up request to the main model. This is a core privacy consideration.

## Settings & Privacy Controls

### Local tool allowlist (manual enable/disable)

Settings key:

- `settings.aiLocalTools.enabledToolNames: string[]`

Only tools listed there are exposed/executable as `server: "myz-local"`.

Implementation details:

- Defaults are generated from `LOCAL_TOOL_NAMES` in `localDefinitions.ts`.
- Settings normalization clamps the allowlist to known tool names.
- Enforced at runtime by `McpCapability.setLocalToolAllowlist(...)`.

### Per-message tool filter (ToolSelection)

In addition to the allowlist, we support a **per-message** filter:

- `McpCapability.setActiveToolFilter(toolNames | null)`

When set, **both local + MCP** tools are restricted to the provided names for the current request only.

This filter is reset after each request (even on errors).

## ToolSelection process ("自动")

Settings:

- `settings.aiLocalTools.mode: "manual" | "auto"`
- `settings.aiLocalTools.autoSelectorTarget: { providerId; modelId } | null`

Behavior:

- **manual**: expose all tools allowed by the local allowlist + enabled MCP servers.
- **auto**: before each user message, run a dedicated selector model to choose a subset of tools for *this one message*.

Code path:

- `messages/ai.ts` builds `toolControl` + `toolSelector` deps for `ConversationAgent.processConversation()`.
- `ConversationAgent` asks the selector for `tool_names` and applies the per-request filter.
- Selector agent implementation:
  - `myz-annotator/src/background/ai/agents/toolSelectionAgent.ts`
  - Inputs: user prompt + candidate tool list (names + descriptions)
  - Output: JSON `{ "tool_names": [...] }`

Fail-safe:

- If “自动” is enabled but `autoSelectorTarget` is missing, no tools are selected for safety.
- If selection fails, tools are disabled for that request (empty selection).

## Adding a new local tool (step-by-step)

1. **Add definition** (UI-safe, no side effects)
   - Edit `myz-annotator/src/background/ai/tools/localDefinitions.ts`
   - Append a `Tool` item with:
     - `name` (stable id, see naming rules below)
     - `description` (clear, user-facing)
     - `inputSchema` (JSON schema; keep it strict)
2. **Add implementation**
   - Edit `myz-annotator/src/background/ai/tools/local.ts`
   - Add a handler to `LOCAL_TOOL_HANDLERS[name]` returning:
     - `content: ContentBlock[]` (prefer `{ type: "text", text }`)
     - optionally `data` for structured results
3. **No extra settings wiring needed**
   - The tool will automatically appear in the Dashboard “本地 Tools” list.
   - Defaults include it via `LOCAL_TOOL_NAMES`.
4. **Verify behavior**
   - Dashboard: enable/disable the tool and save.
   - Confirm tool availability in conversations (model tool calling must be enabled).
   - If disabled: tool should not appear in tool list, and tool execution should be rejected with `Tool not enabled`.

## Design requirements for tools (recommended)

### Security & privacy

- Assume tool output may be sent to third-party models. Minimize sensitive data by default.
- Avoid returning raw, full datasets. Prefer:
  - small summaries
  - top-N
  - redaction or truncation
- Always apply strict limits (e.g. `limit <= 50`).

### Naming

- Use stable, versionless names aligned with standard agent tool conventions (e.g. `Read`, `Write`, `Edit`, `Glob`, `List`, `WebSearch`, `WebFetch`, `Task`, `RunDomActions`).
- Keep names consistent and avoid gratuitous prefixes unless the tool is MyZ-specific.
- When renaming tool names, update settings normalization so existing allowlists migrate to the new names.

### Input schema

- Use JSON schema with explicit properties.
- Prefer:
  - required fields for core inputs (`query`, etc.)
  - numeric ranges (`minimum`, `maximum`)
  - defaults for optional params
- Validate and normalize inputs inside the handler (never trust the model).

### Output

- Return concise human-readable `content` as the primary output.
- Put raw structures into `data` only when it’s useful and safe.
- Keep outputs deterministic and stable (to reduce tool-call loops).

### Performance & robustness

- Tools run in MV3 service worker: keep handlers async and non-blocking.
- Handle large storage reads carefully; reduce work with early exits and limits.
- Return friendly error messages; do not throw unless it’s a true execution failure.
