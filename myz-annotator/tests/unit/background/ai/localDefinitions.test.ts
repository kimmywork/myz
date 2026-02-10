import { describe, expect, it } from "vitest";
import { LOCAL_TOOL_DEFINITIONS } from "@/background/ai/tools/localDefinitions.ts";

describe("localDefinitions", () => {
  it("includes Task tool with complete_all fields", () => {
    const taskTool = LOCAL_TOOL_DEFINITIONS.find((tool) => tool.name === "Task");
    expect(taskTool).toBeTruthy();
    const actionEnum = (taskTool as any).inputSchema?.properties?.action?.enum || [];
    expect(actionEnum).toContain("complete_all");
    const reason = (taskTool as any).inputSchema?.properties?.reason;
    const role = (taskTool as any).inputSchema?.properties?.role;
    expect(reason).toBeTruthy();
    expect(role?.enum).toEqual(["validator"]);
  });
});
