import { describe, expect, it } from "vitest";
import { buildConversationPromptMessages } from "@/background/ai/prompt/conversation.ts";

describe("buildConversationPromptMessages", () => {
  it("adds selection context to user message", () => {
    const messages = buildConversationPromptMessages(
      [
        {
          id: "1",
          role: "user",
          content: "hello",
          metadata: {
            selectionContextText: "selected",
            skillList: [{ name: "skill-a", description: "desc" }],
          },
        },
      ] as any,
      { includeVision: false },
    );

    expect(messages[0].content).toContain("选中内容（上下文）");
  });

  it("returns image parts when includeVision is true", () => {
    const messages = buildConversationPromptMessages(
      [
        {
          id: "1",
          role: "user",
          content: "hello",
          metadata: {
            attachments: [{ dataUrl: "data:image/png;base64,abcd" }],
          },
        },
      ] as any,
      { includeVision: true },
    );

    const content = messages[0].content as any[];
    expect(Array.isArray(content)).toBe(true);
    expect(content.some((part) => part.type === "image_url")).toBe(true);
  });

  it("replays assistant reasoning only when enabled for the stored message", () => {
    const history = [
      {
        id: "1",
        role: "assistant",
        content: "answer",
        reasoning_content: "hidden chain",
        metadata: {
          providerId: "provider-a",
        },
      },
    ] as any;

    const included = buildConversationPromptMessages(history, {
      includeAssistantReasoning: (message) =>
        message.metadata?.providerId === "provider-a",
    });
    expect(included[0]).toMatchObject({
      role: "assistant",
      content: "answer",
      reasoning_content: "hidden chain",
    });

    const omitted = buildConversationPromptMessages(history, {
      includeAssistantReasoning: (message) =>
        message.metadata?.providerId === "provider-b",
    });
    expect(omitted[0]).toMatchObject({
      role: "assistant",
      content: "answer",
    });
    expect("reasoning_content" in omitted[0]).toBe(false);
  });
});
