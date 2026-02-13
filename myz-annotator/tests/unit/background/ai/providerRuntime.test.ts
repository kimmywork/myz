import { describe, expect, it, vi } from "vitest";
import { acquireProviderRuntime } from "@/background/ai/runtime/providerRuntime.ts";

vi.mock("@/background/ai/runtime/providerSession.js", () => ({
  createProviderSession: vi.fn(() => ({
    connectMcp: vi.fn(async () => undefined),
    disconnectMcp: vi.fn(async () => undefined),
    listTools: vi.fn(() => []),
    client: { createCompletion: vi.fn() },
    clientWithTools: { createCompletion: vi.fn() },
  })),
}));

describe("providerRuntime", () => {
  it("reuses runtime by provider key and ref counts", async () => {
    const provider: any = {
      id: "p1",
      name: "Provider",
      type: "openai_compatible",
      enabled: true,
      baseUrl: "http://localhost",
      apiKey: "key",
      headers: "",
      lastTest: { ok: true, model: "gpt-4" },
    };

    const runtime1 = await acquireProviderRuntime(provider, []);
    const runtime2 = await acquireProviderRuntime(provider, []);
    expect(runtime1).toBe(runtime2);
    expect(runtime1.acquireCount).toBe(2);

    await runtime1.release();
    expect(runtime1.acquireCount).toBe(1);
    await runtime2.release();
    expect(runtime1.acquireCount).toBe(0);
  });

  it("connects and disconnects MCP with ref counting", async () => {
    const provider: any = {
      id: "p1",
      name: "Provider",
      type: "openai_compatible",
      enabled: true,
      baseUrl: "http://localhost",
      apiKey: "key",
      headers: "",
      lastTest: { ok: true, model: "gpt-4" },
    };

    const runtime = await acquireProviderRuntime(provider, []);
    await runtime.connectMcp();
    await runtime.connectMcp();
    await runtime.disconnectMcp();
    await runtime.disconnectMcp();
  });
});
