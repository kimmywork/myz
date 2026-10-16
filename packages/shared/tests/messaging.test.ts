import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMessage, sendMessageToTab } from "../src/messaging";

describe("messaging", () => {
  const originalChrome = global.chrome;

  beforeEach(() => {
    global.chrome = {
      runtime: {
        sendMessage: vi.fn(),
        // @ts-ignore
        lastError: undefined,
      },
      tabs: {
        sendMessage: vi.fn(),
      },
    } as any;
  });

  afterEach(() => {
    global.chrome = originalChrome;
  });

  describe("sendMessage", () => {
    it("should resolve with data on success", async () => {
      const mockResponse = { ok: true, data: { result: "success" } };
      (global.chrome.runtime.sendMessage as any).mockImplementation(
        (msg: any, cb: any) => cb(mockResponse),
      );

      const result = await sendMessage("TEST", {});
      expect(result).toEqual({ result: "success" });
    });

    it("should reject on runtime error", async () => {
      // @ts-ignore
      global.chrome.runtime.lastError = { message: "Runtime error" };
      (global.chrome.runtime.sendMessage as any).mockImplementation(
        (msg: any, cb: any) => cb(null),
      );

      await expect(sendMessage("TEST", {})).rejects.toThrow("Runtime error");
    });

    it("should reject on response error", async () => {
      const mockResponse = { ok: false, error: "Custom error" };
      (global.chrome.runtime.sendMessage as any).mockImplementation(
        (msg: any, cb: any) => cb(mockResponse),
      );

      await expect(sendMessage("TEST", {})).rejects.toThrow("Custom error");
    });

    it("preserves falsy data instead of falling back to the envelope", async () => {
      for (const data of [null, false, 0, ""]) {
        (global.chrome.runtime.sendMessage as any).mockImplementation(
          (msg: any, cb: any) => cb({ ok: true, data }),
        );
        await expect(sendMessage("TEST", {})).resolves.toBe(data);
      }
    });

    it("falls back to the whole response when there is no data key", async () => {
      const envelope = { ok: true, result: "raw" };
      (global.chrome.runtime.sendMessage as any).mockImplementation(
        (msg: any, cb: any) => cb(envelope),
      );
      await expect(sendMessage("TEST", {})).resolves.toEqual(envelope);
    });
  });

  describe("sendMessageToTab", () => {
    it("should resolve with response", async () => {
      const mockResponse = { result: "success" };
      (global.chrome.tabs.sendMessage as any).mockImplementation(
        (id: any, msg: any, cb: any) => cb(mockResponse),
      );

      const result = await sendMessageToTab(1, "TEST", {});
      expect(result).toEqual(mockResponse);
    });

    it("should reject on runtime error", async () => {
      // @ts-ignore
      global.chrome.runtime.lastError = { message: "Tab error" };
      (global.chrome.tabs.sendMessage as any).mockImplementation(
        (id: any, msg: any, cb: any) => cb(null),
      );

      await expect(sendMessageToTab(1, "TEST", {})).rejects.toThrow(
        "Tab error",
      );
    });
  });
});
