import { test } from "node:test"
import assert from "node:assert/strict"
import { createToolCallingCapability } from "../src/providers/capabilities/toolCalling"
import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
} from "../src/providers/types"

test("tool-calling capability aggregates usage across multiple provider round-trips", async () => {
  const requests: ProviderChatCompletionRequest[] = []
  const responses: ProviderChatCompletionResponse[] = [
    {
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "先看一下",
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "Write",
                  arguments: "{\"path\":\"/workspace/a.md\"}",
                },
              },
            ],
          },
        },
      ],
      usage: {
        total_tokens: 120,
        input_tokens: 100,
        output_tokens: 20,
        input_tokens_details: {
          cached_tokens: 80,
        },
      },
    },
    {
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "done",
          },
        },
      ],
      usage: {
        total_tokens: 70,
        input_tokens: 50,
        output_tokens: 20,
      },
    },
  ]

  const baseClient: ChatCompletionClient = {
    async createCompletion(request) {
      requests.push(request)
      const next = responses.shift()
      if (!next) {
        throw new Error("No more mocked responses")
      }
      return next
    },
  }

  const capability = createToolCallingCapability({
    getTools: async () => [],
    executeToolCall: async () => "ok",
  })
  const client = capability(baseClient)

  const response = await client.createCompletion({
    model: "gpt-test",
    messages: [
      {
        role: "user",
        content: "hello",
      },
    ],
  })

  assert.equal(requests.length, 2)
  assert.deepEqual(response.usage, {
    total_tokens: 190,
    input_tokens: 150,
    output_tokens: 40,
    input_tokens_details: {
      cached_tokens: 80,
    },
  })
})
