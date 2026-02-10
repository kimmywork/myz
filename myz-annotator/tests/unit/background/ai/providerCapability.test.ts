import { describe, expect, it } from "vitest";
import { composeCapabilities } from "@/background/ai/providers/capability.ts";

describe("composeCapabilities", () => {
  it("applies capabilities in order", async () => {
    const base = { createCompletion: async () => ({ ok: true }) } as any;
    const cap1 = (client: any) => ({
      async createCompletion(request: any) {
        const res = await client.createCompletion(request);
        return { ...res, step: 1 };
      },
    });
    const cap2 = (client: any) => ({
      async createCompletion(request: any) {
        const res = await client.createCompletion(request);
        return { ...res, step: 2 };
      },
    });

    const composed = composeCapabilities(base, [cap1, cap2]);
    const result = await composed.createCompletion(
      { model: "gpt-4", messages: [] } as any,
      {} as any,
    );
    expect(result.step).toBe(2);
  });
});
