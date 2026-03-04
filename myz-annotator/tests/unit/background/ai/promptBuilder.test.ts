import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/background/ai/prompt/builder.ts";

describe("PromptBuilder", () => {
  it("builds message sequence", () => {
    const builder = new PromptBuilder();
    builder.addSystem("sys").addUser("user").addAssistant("assistant");
    const messages = builder.build();
    expect(messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
    ]);
  });

  it("adds tool message with tool_call_id", () => {
    const builder = new PromptBuilder();
    builder.addTool("ok", "call-1");
    const messages = builder.build();
    expect(messages[0]).toMatchObject({ role: "tool", tool_call_id: "call-1" });
  });
});
