import { describe, it, expect } from "vitest";
import {
  registerMessageHandler,
  handleMessage,
  hasHandler,
} from "@/background/messages/handler";

describe("background message handler", () => {
  it("should return false for unregistered handler via hasHandler", () => {
    expect(hasHandler("missing")).toBe(false);
  });

  it("should register and resolve a handler", async () => {
    registerMessageHandler("myz:test", async () => "ok");
    expect(hasHandler("myz:test")).toBe(true);

    const result = await handleMessage(
      "myz:test",
      {},
      { tab: { id: 1 } as chrome.tabs.Tab },
    );
    expect(result).toBe("ok");
  });

  it("should throw for unregistered handler", async () => {
    await expect(
      handleMessage("missing", {}, { tab: { id: 1 } as chrome.tabs.Tab }),
    ).rejects.toThrow("No handler registered for message key: missing");
  });
});
