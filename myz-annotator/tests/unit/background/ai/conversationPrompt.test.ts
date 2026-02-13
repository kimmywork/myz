import { describe, expect, it } from "vitest";
import { buildConversationPromptMessages } from "@/background/ai/prompt/conversation.ts";

describe("buildConversationPromptMessages", () => {
  it("adds selection context and skill list to user message", () => {
    const messages = buildConversationPromptMessages([
      {
        id: "1",
        role: "user",
        content: "hello",
        metadata: {
          selectionContextText: "selected",
          skillList: [{ name: "skill-a", description: "desc" }],
        },
      },
    ] as any, { includeVision: false });

    expect(messages[0].content).toContain("选中内容（上下文）");
    expect(messages[0].content).toContain("skill-a");
  });

  it("returns image parts when includeVision is true", () => {
    const messages = buildConversationPromptMessages([
      {
        id: "1",
        role: "user",
        content: "hello",
        metadata: {
          attachments: [{ dataUrl: "data:image/png;base64,abcd" }],
        },
      },
    ] as any, { includeVision: true });

    const content = messages[0].content as any[];
    expect(Array.isArray(content)).toBe(true);
    expect(content.some((part) => part.type === "image_url")).toBe(true);
  });
});
