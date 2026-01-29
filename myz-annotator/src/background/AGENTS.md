# myz-annotator Background AI Architecture

This folder contains the MV3 service worker background logic. The AI integration is structured as:

- **Providers (transport + capabilities)**: OpenAI-compatible chat completions, plus composable capabilities (streaming/tool-calling/reasoning/vendor quirks).
- **Agents (application layer)**: Conversation + Insights workflows built on top of providers.
- **Runtime (selection + caching)**: Resolves agent→(provider, model, temperature), creates sessions (provider + MCP), caches them globally, and ref-counts MCP connect/disconnect.

Import shared AI types from `@/background/ai/types.js`.

## Key Entry Points

- Background message handlers: `myz-annotator/src/background/messages/ai.ts`
  - Resolves the selected agent target via `resolveAgentTarget()` and acquires a cached provider runtime via `acquireProviderRuntime()`.
- Agent selection: `myz-annotator/src/background/ai/runtime/agentSelection.ts`
  - Validates enabled/tested provider + enabled model and returns `{ provider, model, temperature }`.
- Provider runtime cache / lifecycle: `myz-annotator/src/background/ai/runtime/providerRuntime.ts`
  - Global cache keyed by provider config + MCP servers; ref-counted MCP connect/disconnect.
- Provider session assembly: `myz-annotator/src/background/ai/runtime/providerSession.ts`
  - Builds provider clients (base + tool-calling) and owns `McpCapability`.
- OpenAI-compatible URL/headers helpers: `myz-annotator/src/background/ai/runtime/openaiCompatible.ts`

## Folder Map

### Types (shared by background + UI)
- `myz-annotator/src/background/ai/types.ts`
  - Message/Conversation types, request/response payload shapes, streaming payloads, tool call types.

### Settings (shared by background + UI)
- `myz-annotator/src/background/settings.ts`
  - `aiProviders[]` (multiple providers), per-provider `models[]` (multiple models), and `aiAgents` (Conversation/Insights target + temperature).

### Providers (transport + capabilities)
- `myz-annotator/src/background/ai/providers/openaiCompatible/jsonClient.ts`
  - Non-streaming OpenAI-compatible JSON client.
- `myz-annotator/src/background/ai/providers/capability.ts`
  - Capability composition helper.
- `myz-annotator/src/background/ai/providers/factory.ts`
  - Builds a `client` and a `clientWithTools` by composing capabilities.
- Capabilities:
  - Streaming (SSE): `myz-annotator/src/background/ai/providers/capabilities/sseStreaming.ts`
  - Tool calling loop: `myz-annotator/src/background/ai/providers/capabilities/toolCalling.ts`
  - Reasoning normalization: `myz-annotator/src/background/ai/providers/capabilities/reasoning.ts`
  - Google Gemini request patching: `myz-annotator/src/background/ai/providers/capabilities/googleGemini.ts`

### Vendor + normalization helpers
- Gemini thought parsing: `myz-annotator/src/background/ai/vendors/googleGemini.ts`
- Message normalization: `myz-annotator/src/background/ai/normalize/message.ts`

### Tools (local + MCP)
- Local tools: `myz-annotator/src/background/ai/tools/local.ts`
- Tool registry (local + MCP merge + execution): `myz-annotator/src/background/ai/tools/registry.ts`
- MCP capability wrapper: `myz-annotator/src/background/ai/capabilities/mcp.ts`

### Agents (application layer)
- Conversation agent: `myz-annotator/src/background/ai/agents/conversationAgent.ts`
  - Owns conversation persistence (IndexedDB + legacy fallback), streaming notifications to UI, and tool-call/tool-result persistence.
- Insights agent: `myz-annotator/src/background/ai/agents/insightsAgent.ts`
  - Builds page-summary prompts and performs multi-attempt completion.

### Prompt building abstraction
- Prompt builder: `myz-annotator/src/background/ai/prompt/builder.ts`
- Conversation prompt shaping: `myz-annotator/src/background/ai/prompt/conversation.ts`

## Runtime Flow (Conversation)

1. UI sends `myz:aiStreamRequest` (sidepanel) or `myz:processWithAi`.
2. `messages/ai.ts`:
   - Resolves `aiAgents.conversation.target` via `resolveAgentTarget(settings, "conversation")`.
   - Acquires a cached provider runtime via `acquireProviderRuntime(target.provider, settings.aiMcpServers)`.
   - Connects MCP only when `target.model.capabilities.toolCalling === true`.
   - Resolves Skill selection (explicit `@skill` + auto selection) and injects only `{ name, description }` into the user message metadata.
3. `ConversationAgent.processConversation()`:
   - Persists the user message.
   - Loads history from IndexedDB; falls back to legacy storage when empty.
   - Builds the model payload via `buildConversationPromptMessages()`.
   - Calls `clientWithTools.createCompletion({ stream: true })`.
   - Emits UI streaming events:
     - `myz:aiStreamStart` → `myz:aiStreamChunk` → `myz:aiStreamComplete` or `myz:aiStreamError`
   - Persists final assistant message with:
     - visible `content`
     - extracted reasoning/thinking in `reasoning_content` and `metadata.reasoning` (if available)
   - Persists tool messages as `role: "tool"` and emits `myz:newMessage` for tool-call/tool-result updates.
4. Handler `finally` disconnects MCP (ref-counted) and releases the provider runtime.

## Context Compaction (Sidepanel)

- Triggered automatically when estimated context usage exceeds `aiAgents.conversation.contextCompressionThreshold`.
- Sidepanel calls `myz:compactConversation` before sending a new user message.
- Compaction is done in background using the conversation model:
  - Summarizes older messages.
  - Creates a new first user message: `原始请求 + 上下文总结`.
  - Preserves the most recent N user/assistant turns.
  - Emits a `system_event` message ("上下文已压缩") for UI only.
  - Resets `skillContextInjected` so skills can be re-injected after compaction.

## Google Gemini (OpenAI-Compatible) Notes

Gemini’s OpenAI-compatible API differs from typical providers:

- **Enable thinking** via request `extra_body.google.thinking_config.include_thoughts = true`.
  - This is patched only when unset (do not overwrite user-provided config).
- **Thinking output** is returned as `<thought>...</thought>` inside `message.content`.
  - `normalizeMessagePayload()` extracts `<thought>` into `reasoning_content` and strips it from visible text.
- **Tool thought signatures** must be echoed back for subsequent tool calls:
  - Expect signature at `tool_calls[].extra_content.google.thought_signature`.
  - Streaming accumulation preserves this in `sseStreaming.ts`.
- Keep field names snake_case for Google (`thought_signature`, `thinking_config`, `include_thoughts`) and avoid camelCase fallbacks.

## Tool Calling Rules

- Tool loop is implemented by `toolCalling.ts` capability.
- Follow-up requests should **not** forward any `reasoning_content` or `<thought>` output back to the model.
  - The tool-calling capability sanitizes assistant content using Gemini thought tag splitting.

## Skill + Local Tools

- Skill storage lives in IndexedDB and is exposed via `/skills/...` paths:
  - The prompt injects `<available_skills>` blocks with locations like `/skills/{name}/SKILL.md`.
  - The model should call `read-file` to load skill content.
- Virtual file system for agent memory is implemented in a separate IndexedDB and exposed via:
  - `list-files`, `read-file`, `write-file`
  - `/skills` paths are routed to skill storage; `/skills` is read-only.

## UI Integration Notes (Sidepanel)

- Streaming UI consumes:
  - `myz:aiStreamStart` / `myz:aiStreamChunk` / `myz:aiStreamComplete` / `myz:aiStreamError`
- Tool calls and tool results are pushed as normal messages via:
  - `myz:newMessage`
- UI should import types from `@/background/ai/types.js`.

## Debugging Checklist

- If tools don’t execute: confirm `runtime.connectMcp()` is called and `myz:listMcpTools` returns expected tools.
- If Gemini tool calls fail with 4xx: ensure tool call messages preserve `tool_calls[].extra_content.google.thought_signature`.
- If thinking is missing: confirm request includes `extra_body.google.thinking_config.include_thoughts` and response contains `<thought>` tags.
