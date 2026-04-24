import { test } from "node:test"
import assert from "node:assert/strict"
import {
  OpenAIResponsesJsonClient,
} from "../src/providers/openaiResponses/jsonClient"

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

test("OpenAIResponsesJsonClient preserves multiple same-name tool calls from streaming completion", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    createSseResponse([
      {
        type: "response.completed",
        response: {
          output: [
            {
              type: "function_call",
              call_id: "call-1",
              name: "Write",
              arguments: "{\"path\":\"/workspace/a.md\",\"content\":\"A\"}",
            },
            {
              type: "function_call",
              call_id: "call-2",
              name: "Write",
              arguments: "{\"path\":\"/workspace/b.md\",\"content\":\"B\"}",
            },
          ],
        },
      },
    ])

  try {
    const client = new OpenAIResponsesJsonClient({
      baseUrl: "https://example.com/v1",
      apiKey: "token",
      headers: "",
    })
    const response = await client.createCompletion(
      {
        model: "gpt-test",
        messages: [
          {
            role: "user",
            content: "write two files",
          },
        ],
        stream: true,
      },
      {},
    )

    const toolCalls = response.choices?.[0]?.message?.tool_calls || []
    assert.equal(toolCalls.length, 2)
    assert.deepEqual(
      toolCalls.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      })),
      [
        {
          id: "call-1",
          name: "Write",
          arguments: "{\"path\":\"/workspace/a.md\",\"content\":\"A\"}",
        },
        {
          id: "call-2",
          name: "Write",
          arguments: "{\"path\":\"/workspace/b.md\",\"content\":\"B\"}",
        },
      ],
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("OpenAIResponsesJsonClient streaming fallback does not duplicate done snapshots for same-name tool calls", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    createSseResponse([
      {
        type: "response.output_item.added",
        item: {
          type: "function_call",
          call_id: "call-1",
          name: "Write",
          arguments: "",
        },
      },
      {
        type: "response.function_call_arguments.delta",
        call_id: "call-1",
        name: "Write",
        delta: "{\"path\":\"/workspace/a.md\",",
      },
      {
        type: "response.function_call_arguments.delta",
        call_id: "call-1",
        delta: "\"content\":\"A\"}",
      },
      {
        type: "response.function_call_arguments.done",
        call_id: "call-1",
        name: "Write",
        arguments: "{\"path\":\"/workspace/a.md\",\"content\":\"A\"}",
      },
      {
        type: "response.output_item.added",
        item: {
          type: "function_call",
          call_id: "call-2",
          name: "Write",
          arguments: "",
        },
      },
      {
        type: "response.function_call_arguments.delta",
        call_id: "call-2",
        name: "Write",
        delta: "{\"path\":\"/workspace/b.md\",",
      },
      {
        type: "response.function_call_arguments.delta",
        call_id: "call-2",
        delta: "\"content\":\"B\"}",
      },
      {
        type: "response.function_call_arguments.done",
        call_id: "call-2",
        name: "Write",
        arguments: "{\"path\":\"/workspace/b.md\",\"content\":\"B\"}",
      },
    ])

  try {
    const client = new OpenAIResponsesJsonClient({
      baseUrl: "https://example.com/v1",
      apiKey: "token",
      headers: "",
    })
    const response = await client.createCompletion(
      {
        model: "gpt-test",
        messages: [
          {
            role: "user",
            content: "write two files",
          },
        ],
        stream: true,
      },
      {},
    )

    const toolCalls = response.choices?.[0]?.message?.tool_calls || []
    assert.equal(toolCalls.length, 2)
    assert.deepEqual(
      toolCalls.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      })),
      [
        {
          id: "call-1",
          name: "Write",
          arguments: "{\"path\":\"/workspace/a.md\",\"content\":\"A\"}",
        },
        {
          id: "call-2",
          name: "Write",
          arguments: "{\"path\":\"/workspace/b.md\",\"content\":\"B\"}",
        },
      ],
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("OpenAIResponsesJsonClient preserves top-level usage in streaming completed payload", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    createSseResponse([
      {
        type: "response.completed",
        response: {
          usage: {
            total_tokens: 100,
            input_tokens: 70,
            output_tokens: 30,
            input_tokens_details: {
              cached_tokens: 45,
            },
          },
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "done",
                },
              ],
            },
          ],
        },
      },
    ])

  try {
    const client = new OpenAIResponsesJsonClient({
      baseUrl: "https://example.com/v1",
      apiKey: "token",
      headers: "",
    })
    const response = await client.createCompletion(
      {
        model: "gpt-test",
        messages: [
          {
            role: "user",
            content: "hello",
          },
        ],
        stream: true,
      },
      {},
    )

    assert.deepEqual(response.usage, {
      total_tokens: 100,
      input_tokens: 70,
      output_tokens: 30,
      input_tokens_details: {
        cached_tokens: 45,
      },
    })
    assert.equal(response.choices?.[0]?.message?.content, "done")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("OpenAIResponsesJsonClient normalizes tool payload ordering for stable cache prefixes", async () => {
  const originalFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    return new Response(
      JSON.stringify({
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
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    )
  }

  try {
    const client = new OpenAIResponsesJsonClient({
      baseUrl: "https://example.com/v1",
      apiKey: "token",
      headers: "",
    })
    await client.createCompletion({
      model: "gpt-test",
      messages: [
        {
          role: "user",
          content: "hello",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "Write",
            description: "write files",
            parameters: {
              type: "object",
              required: ["content", "path"],
              properties: {
                path: {
                  type: "string",
                },
                content: {
                  type: "string",
                },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "Read",
            description: "read files",
            parameters: {
              type: "object",
              required: ["path"],
              properties: {
                path: {
                  type: "string",
                },
              },
            },
          },
        },
      ],
    })

    assert.ok(capturedBody)
    assert.deepEqual(capturedBody.tools, [
      {
        type: "function",
        name: "Read",
        description: "read files",
        parameters: {
          properties: {
            path: {
              type: "string",
            },
          },
          required: ["path"],
          type: "object",
        },
      },
      {
        type: "function",
        name: "Write",
        description: "write files",
        parameters: {
          properties: {
            content: {
              type: "string",
            },
            path: {
              type: "string",
            },
          },
          required: ["content", "path"],
          type: "object",
        },
      },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("OpenAIResponsesJsonClient keeps prior-turn tool chain in request input", async () => {
  const originalFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    return new Response(
      JSON.stringify({
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
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    )
  }

  try {
    const client = new OpenAIResponsesJsonClient({
      baseUrl: "https://example.com/v1",
      apiKey: "token",
      headers: "",
    })
    await client.createCompletion({
      model: "gpt-test",
      messages: [
        {
          role: "user",
          content: "read the file",
        },
        {
          role: "assistant",
          content: "我先看一下文件",
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "Read",
                arguments: "{\"path\":\"/workspace/a.md\"}",
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call-1",
          content: "# A\nhello",
        },
        {
          role: "assistant",
          content: "文件里写的是 hello",
        },
        {
          role: "user",
          content: "那继续",
        },
      ],
    })

    assert.ok(capturedBody)
    assert.deepEqual(capturedBody.input, [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "read the file" }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "我先看一下文件" }],
      },
      {
        type: "function_call",
        call_id: "call-1",
        name: "Read",
        arguments: "{\"path\":\"/workspace/a.md\"}",
      },
      {
        type: "function_call_output",
        call_id: "call-1",
        output: "# A\nhello",
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "文件里写的是 hello" }],
      },
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "那继续" }],
      },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("OpenAIResponsesJsonClient drops incomplete prior-turn tool calls from request input", async () => {
  const originalFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    return new Response(
      JSON.stringify({
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
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    )
  }

  try {
    const client = new OpenAIResponsesJsonClient({
      baseUrl: "https://example.com/v1",
      apiKey: "token",
      headers: "",
    })
    await client.createCompletion({
      model: "gpt-test",
      messages: [
        {
          role: "user",
          content: "read the file",
        },
        {
          role: "assistant",
          content: "我先看一下文件",
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "Read",
                arguments: "{\"path\":\"/workspace/a.md\"}",
              },
            },
          ],
        },
        {
          role: "assistant",
          content: "继续说后面的事",
        },
      ],
    })

    assert.ok(capturedBody)
    assert.deepEqual(capturedBody.input, [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "read the file" }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "我先看一下文件" }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "继续说后面的事" }],
      },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("OpenAIResponsesJsonClient only sends previous_response_id when explicitly enabled", async () => {
  const originalFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null
  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    return new Response(
      JSON.stringify({
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
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    )
  }

  try {
    const client = new OpenAIResponsesJsonClient({
      baseUrl: "https://example.com/v1",
      apiKey: "token",
      headers: "",
    })
    await client.createCompletion({
      model: "gpt-test",
      messages: [
        {
          role: "user",
          content: "hello",
        },
      ],
      previous_response_id: "resp-1",
      supports_previous_response_id: false,
    })

    assert.ok(capturedBody)
    assert.equal(capturedBody.previous_response_id, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})
