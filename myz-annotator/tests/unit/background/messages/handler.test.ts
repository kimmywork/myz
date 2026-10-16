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
    registerMessageHandler("myz:getAllTags", async () => ["ok"]);
    expect(hasHandler("myz:getAllTags")).toBe(true);

    const result = await handleMessage("myz:getAllTags", undefined, {
      trusted: false,
      tabId: 1,
    });
    expect(result).toEqual(["ok"]);
  });

  it("should throw for unregistered handler", async () => {
    await expect(
      handleMessage("missing", {}, { trusted: false, tabId: 1 }),
    ).rejects.toThrow("No handler registered for message key: missing");
  });
});
