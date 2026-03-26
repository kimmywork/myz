import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createUserMessage } from "../src/conversations"
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

test("generateReply logs final llm request json when debug is enabled", async () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-ai-debug-"))
  const config = createRuntimeConfig(root, {
    debug: true,
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
      requestBody?: {
        model?: string
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
    assert.equal(payload.requestBody?.input?.[0]?.role, "user")
    assert.equal(
      payload.requestBody?.input?.[0]?.content?.[0]?.text,
      "debug this",
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
