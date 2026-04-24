import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createAssistantMessage, createUserMessage } from "../src/conversations"
import { generateReply } from "../src/ai"
import { createRuntimeConfig } from "./helpers/runtimeConfig"

function createSseResponse(events: unknown[]) {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      const chunks = events
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .concat("data: [DONE]\n\n")
        .join("")
      controller.enqueue(encoder.encode(chunks))
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
    },
  })
}

test("generateReply keeps responses usage from top-level payload and normalizes cache fields", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-ai-"))
  const config = createRuntimeConfig(root, {
    ai: {
      provider: "openai_responses",
      baseUrl: "https://api.openai.com/v1",
      accessToken: "token",
      capabilities: {
        toolCalling: false,
        reasoning: false,
        vision: false,
        imageOutput: false,
      },
    },
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    createSseResponse([
      {
        type: "response.completed",
        response: {
          usage: {
            total_tokens: 120,
            input_tokens: 80,
            output_tokens: 40,
            input_tokens_details: {
              cached_tokens: 50,
            },
            output_tokens_details: {
              reasoning_tokens: 10,
            },
          },
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "已处理。",
                },
              ],
            },
          ],
        },
      },
    ])

  try {
    const reply = await generateReply({
      config,
      conversationId: "c1",
      messages: [createUserMessage("c1", "test")],
    })

    assert.equal(reply.content, "已处理。")
    assert.deepEqual(reply.usage, {
      total_tokens: 120,
      input_tokens: 80,
      output_tokens: 40,
      input_tokens_details: {
        cached_tokens: 50,
      },
      output_tokens_details: {
        reasoning_tokens: 10,
      },
      prompt_tokens: 80,
      promptTokens: 80,
      completion_tokens: 40,
      completionTokens: 40,
      reasoning_tokens: 10,
      reasoningTokens: 10,
      cached_prompt_tokens: 50,
      cachedPromptTokens: 50,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("generateReply sends a stable prompt cache key for responses requests", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-ai-cache-key-"))
  const config = createRuntimeConfig(root, {
    ai: {
      provider: "openai_responses",
      baseUrl: "https://api.openai.com/v1",
      accessToken: "token",
      capabilities: {
        toolCalling: false,
        reasoning: false,
        vision: false,
        imageOutput: false,
      },
    },
  })

  const originalFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    return createSseResponse([
      {
        type: "response.completed",
        response: {
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "ok",
                },
              ],
            },
          ],
        },
      },
    ])
  }

  try {
    const reply = await generateReply({
      config,
      conversationId: "c-cache",
      messages: [createUserMessage("c-cache", "test cache key")],
    })

    assert.equal(reply.content, "ok")
    assert.equal(
      capturedBody?.prompt_cache_key,
      `myz-bot:${config.workspaceId}:c-cache`,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("generateReply uses previous_response_id for incremental responses turns", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-ai-prev-response-"))
  const config = createRuntimeConfig(root, {
    ai: {
      provider: "openai_responses",
      baseUrl: "https://api.openai.com/v1",
      accessToken: "token",
      capabilities: {
        toolCalling: false,
        reasoning: false,
        vision: false,
        imageOutput: false,
      },
    },
  })

  const previousAssistant = createAssistantMessage("c-prev", "first reply", {
    providerResponseId: "resp-prev",
  })

  const originalFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    return createSseResponse([
      {
        type: "response.completed",
        response: {
          id: "resp-next",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "second reply",
                },
              ],
            },
          ],
        },
      },
    ])
  }

  try {
    const reply = await generateReply({
      config,
      conversationId: "c-prev",
      messages: [
        createUserMessage("c-prev", "first question"),
        previousAssistant,
        createUserMessage("c-prev", "follow up question"),
      ],
    })

    assert.equal(reply.content, "second reply")
    assert.equal(reply.responseId, "resp-next")
    assert.equal(capturedBody?.previous_response_id, "resp-prev")
    assert.deepEqual(capturedBody?.input, [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "follow up question" }],
      },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("generateReply can continue from a resumable response even when current turn injects hidden context", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-ai-context-prev-"))
  const config = createRuntimeConfig(root, {
    ai: {
      provider: "openai_responses",
      baseUrl: "https://api.openai.com/v1",
      accessToken: "token",
      capabilities: {
        toolCalling: false,
        reasoning: false,
        vision: false,
        imageOutput: false,
      },
    },
  })

  const previousAssistant = createAssistantMessage("c-ctx", "first reply", {
    providerResponseId: "resp-clean",
    providerResponseResumable: true,
  })

  const hiddenContext = createUserMessage("c-ctx", "当前会话摘要：...", {
    type: "context_injection",
    hiddenFromHistory: true,
  })

  const originalFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    return createSseResponse([
      {
        type: "response.completed",
        response: {
          id: "resp-hidden",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "reply with hidden context",
                },
              ],
            },
          ],
        },
      },
    ])
  }

  try {
    const reply = await generateReply({
      config,
      conversationId: "c-ctx",
      messages: [
        createUserMessage("c-ctx", "first question"),
        previousAssistant,
        hiddenContext,
        createUserMessage("c-ctx", "follow up with summary"),
      ],
    })

    assert.equal(capturedBody?.previous_response_id, "resp-clean")
    assert.deepEqual(capturedBody?.input, [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "当前会话摘要：..." }],
      },
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "follow up with summary" }],
      },
    ])
    assert.equal(reply.responseResumable, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("generateReply does not continue from a non-resumable response id", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-ai-nonresumable-"))
  const config = createRuntimeConfig(root, {
    ai: {
      provider: "openai_responses",
      baseUrl: "https://api.openai.com/v1",
      accessToken: "token",
      capabilities: {
        toolCalling: false,
        reasoning: false,
        vision: false,
        imageOutput: false,
      },
    },
  })

  const previousAssistant = createAssistantMessage("c-stop", "hidden reply", {
    providerResponseId: "resp-stop",
    providerResponseResumable: false,
  })

  const originalFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    return createSseResponse([
      {
        type: "response.completed",
        response: {
          id: "resp-fresh",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "fresh request",
                },
              ],
            },
          ],
        },
      },
    ])
  }

  try {
    await generateReply({
      config,
      conversationId: "c-stop",
      messages: [
        createUserMessage("c-stop", "older"),
        previousAssistant,
        createUserMessage("c-stop", "next turn"),
      ],
    })

    assert.equal(capturedBody?.previous_response_id, undefined)
    assert.deepEqual(capturedBody?.input, [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "older" }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "hidden reply" }],
      },
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "next turn" }],
      },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("generateReply does not send OpenAI-only continuation fields to non-OpenAI responses backends", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-ai-third-party-responses-"))
  const config = createRuntimeConfig(root, {
    ai: {
      provider: "openai_responses",
      baseUrl: "https://example.com/v1",
      accessToken: "token",
      capabilities: {
        toolCalling: false,
        reasoning: false,
        vision: false,
        imageOutput: false,
      },
    },
  })

  const previousAssistant = createAssistantMessage("c-3p", "first reply", {
    providerResponseId: "resp-prev",
    providerResponseResumable: true,
  })

  const originalFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    return createSseResponse([
      {
        type: "response.completed",
        response: {
          id: "resp-next",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "second reply",
                },
              ],
            },
          ],
        },
      },
    ])
  }

  try {
    const reply = await generateReply({
      config,
      conversationId: "c-3p",
      messages: [
        createUserMessage("c-3p", "first question"),
        previousAssistant,
        createUserMessage("c-3p", "follow up question"),
      ],
    })

    assert.equal(reply.content, "second reply")
    assert.equal(reply.previousResponseId, undefined)
    assert.equal(reply.promptCacheKey, undefined)
    assert.equal(capturedBody?.previous_response_id, undefined)
    assert.equal(capturedBody?.prompt_cache_key, undefined)
    assert.deepEqual(capturedBody?.input, [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "first question" }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "first reply" }],
      },
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "follow up question" }],
      },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("generateReply logs final llm request json when debug is enabled", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-ai-debug-"))
  const config = createRuntimeConfig(root, {
    debug: true,
    ai: {
      provider: "openai_responses",
      baseUrl: "https://api.openai.com/v1",
      accessToken: "token",
      capabilities: {
        toolCalling: false,
        reasoning: false,
        vision: false,
        imageOutput: false,
      },
    },
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    createSseResponse([
      {
        type: "response.completed",
        response: {
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "ok",
                },
              ],
            },
          ],
        },
      },
    ])

  try {
    const reply = await generateReply({
      config,
      conversationId: "c-debug",
      messages: [createUserMessage("c-debug", "debug this")],
    })

    assert.equal(reply.content, "ok")
    const logDir = join(config.systemDir, "debug", "llm")
    const files = readdirSync(logDir)
    assert.equal(files.length, 1)
    assert.match(files[0] || "", /^\d{4}-\d{2}-\d{2}T.*\.json$/)
    const payload = JSON.parse(
      readFileSync(join(logDir, files[0] || ""), "utf-8"),
    ) as {
      conversationId: string
      provider: string
      requestSummary?: {
        previousResponseId?: string
        promptCacheKey?: string
        inputItems?: number
      }
      requestBody?: {
        model?: string
        previous_response_id?: string
        prompt_cache_key?: string
        input?: Array<{
          role?: string
          content?: Array<{ type?: string; text?: string }>
        }>
        stream?: boolean
      }
    }
    assert.equal(payload.conversationId, "c-debug")
    assert.equal(payload.provider, "openai_responses")
    assert.equal(payload.requestBody?.model, "gpt-test")
    assert.equal(payload.requestBody?.stream, true)
    assert.equal(payload.requestSummary?.previousResponseId, "")
    assert.equal(
      payload.requestSummary?.promptCacheKey,
      `myz-bot:${config.workspaceId}:c-debug`,
    )
    assert.equal(payload.requestSummary?.inputItems, 1)
    assert.equal(
      payload.requestBody?.prompt_cache_key,
      `myz-bot:${config.workspaceId}:c-debug`,
    )
    assert.equal(payload.requestBody?.input?.[0]?.role, "user")
    assert.equal(
      payload.requestBody?.input?.[0]?.content?.[0]?.text,
      "debug this",
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("generateReply ignores debug log write failures", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-ai-debug-fail-"))
  const blockingFile = join(root, "not-a-dir")
  writeFileSync(blockingFile, "x")
  const config = createRuntimeConfig(root, {
    debug: true,
    systemDir: blockingFile,
    ai: {
      provider: "openai_responses",
      baseUrl: "https://api.openai.com/v1",
      accessToken: "token",
      capabilities: {
        toolCalling: false,
        reasoning: false,
        vision: false,
        imageOutput: false,
      },
    },
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    createSseResponse([
      {
        type: "response.completed",
        response: {
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "still ok",
                },
              ],
            },
          ],
        },
      },
    ])

  try {
    const reply = await generateReply({
      config,
      conversationId: "c-debug-fail",
      messages: [createUserMessage("c-debug-fail", "debug fail")],
    })

    assert.equal(reply.content, "still ok")
  } finally {
    globalThis.fetch = originalFetch
  }
})
