import { test } from "node:test"
import assert from "node:assert/strict"
import { buildConversationPromptMessages } from "../src/prompt/conversation"

test("buildConversationPromptMessages does not inject skill catalog metadata", () => {
  const messages = buildConversationPromptMessages([
    {
      role: "user",
      content: "继续处理",
      metadata: {
        skillList: [
          {
            name: "workspace-delivery-loop",
            description: "delivery flow",
          },
        ],
        skillContext: "技能说明不应自动注入",
      },
    },
  ])

  assert.equal(messages.length, 1)
  assert.equal(messages[0]?.role, "user")
  assert.equal(messages[0]?.content, "继续处理")
})
