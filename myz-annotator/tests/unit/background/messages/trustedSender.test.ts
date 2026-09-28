import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeMessage,
  isPrivilegedMessage,
  isTrustedExtensionPage,
} from "@/background/messages/trustedSender";

const EXTENSION_ID = "abcdefghijklmnop";

function contentScriptSender(): chrome.runtime.MessageSender {
  return {
    tab: { id: 7 } as chrome.tabs.Tab,
    url: "https://example.com/article",
  };
}

function extensionPageSender(): chrome.runtime.MessageSender {
  return {
    url: `chrome-extension://${EXTENSION_ID}/src/dashboard/dashboard.html`,
  };
}

describe("trusted sender authorization", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", { runtime: { id: EXTENSION_ID } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks the sync control messages as privileged", () => {
    expect(isPrivilegedMessage("myz:syncSetKey")).toBe(true);
    expect(isPrivilegedMessage("myz:syncClearKey")).toBe(true);
    expect(isPrivilegedMessage("myz:syncUpdateSettings")).toBe(true);
    expect(isPrivilegedMessage("myz:syncNow")).toBe(true);
    expect(isPrivilegedMessage("myz:syncTestConnection")).toBe(true);
    expect(isPrivilegedMessage("myz:getHighlights")).toBe(false);
  });

  it("rejects a content script sender (sender.tab present)", () => {
    const sender = contentScriptSender();
    expect(isTrustedExtensionPage(sender)).toBe(false);
    for (const type of [
      "myz:syncSetKey",
      "myz:syncClearKey",
      "myz:syncUpdateSettings",
      "myz:syncNow",
      "myz:syncTestConnection",
    ]) {
      const result = authorizeMessage(type, { userGesture: true }, sender);
      expect(result.ok).toBe(false);
    }
  });

  it("accepts a trusted extension page for non-key privileged messages", () => {
    const sender = extensionPageSender();
    expect(isTrustedExtensionPage(sender)).toBe(true);
    expect(authorizeMessage("myz:syncUpdateSettings", {}, sender).ok).toBe(
      true,
    );
    expect(authorizeMessage("myz:syncNow", {}, sender).ok).toBe(true);
    expect(authorizeMessage("myz:syncTestConnection", {}, sender).ok).toBe(
      true,
    );
  });

  it("requires an explicit user gesture for key changes", () => {
    const sender = extensionPageSender();
    expect(authorizeMessage("myz:syncSetKey", {}, sender).ok).toBe(false);
    expect(
      authorizeMessage("myz:syncClearKey", { userGesture: false }, sender).ok,
    ).toBe(false);
    expect(
      authorizeMessage("myz:syncSetKey", { userGesture: true }, sender).ok,
    ).toBe(true);
    expect(
      authorizeMessage("myz:syncClearKey", { userGesture: true }, sender).ok,
    ).toBe(true);
  });

  it("rejects senders from another extension id", () => {
    const sender: chrome.runtime.MessageSender = {
      url: "chrome-extension://someoneelse/dashboard.html",
    };
    expect(isTrustedExtensionPage(sender)).toBe(false);
    expect(authorizeMessage("myz:syncNow", {}, sender).ok).toBe(false);
  });

  it("rejects a missing sender and allows non-privileged messages", () => {
    expect(authorizeMessage("myz:syncNow", {}, undefined).ok).toBe(false);
    expect(authorizeMessage("myz:getHighlights", {}, undefined).ok).toBe(true);
  });
});
