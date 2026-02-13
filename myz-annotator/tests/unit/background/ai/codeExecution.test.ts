import { describe, expect, it, vi } from "vitest";
import { executeSandboxedCode } from "@/background/ai/tools/codeExecution.ts";
import { installFakeChrome } from "./testUtils.ts";

describe("codeExecution", () => {
  it("rejects empty code", async () => {
    await expect(executeSandboxedCode({ code: "" })).rejects.toThrow("请输入");
  });

  it("executes code through offscreen document", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true,
      resultText: "42",
      resultType: "number",
      truncated: false,
      consoleLogs: ["log"],
    }));

    installFakeChrome({
      runtime: {
        sendMessage,
        getURL: vi.fn((path: string) => `chrome-extension://${path}`),
      },
      offscreen: {
        hasDocument: vi.fn(async () => false),
        createDocument: vi.fn(async () => undefined),
      },
    } as any);

    const result = await executeSandboxedCode({ code: "1+1" });
    expect(result.resultText).toBe("42");
    expect(sendMessage).toHaveBeenCalled();
  });
});
