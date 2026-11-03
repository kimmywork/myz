import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/background/constants";
import {
  canSplitWith,
  isSplitTogether,
  pickChatTab,
} from "../../../src/background/messages/ask-ai";
import { pickPublicSettings } from "../../../src/background/settings-public";

function tab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return {
    id: 1,
    index: 0,
    windowId: 10,
    pinned: false,
    groupId: -1,
    splitViewId: -1,
    ...overrides,
  } as chrome.tabs.Tab;
}

describe("public settings", () => {
  it("exposes the AI switch and provider label but not the template", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      ai: {
        enabled: false,
        provider: "qwen" as const,
        promptTemplate: "secret {TEXT}",
      },
    };
    expect(pickPublicSettings(settings).ai).toEqual({
      enabled: false,
      provider: "qwen",
      providerLabel: "Qwen",
    });
    expect(JSON.stringify(pickPublicSettings(settings))).not.toContain(
      "secret",
    );
  });

  it("stays disabled for settings stored before the feature existed", () => {
    const { ai: _ai, ...legacy } = DEFAULT_SETTINGS;
    expect(pickPublicSettings(legacy as typeof DEFAULT_SETTINGS).ai).toEqual({
      enabled: false,
      provider: "deepseek",
      providerLabel: "DeepSeek",
    });
  });
});

describe("split view decision", () => {
  beforeEach(() => {
    (globalThis as { chrome?: unknown }).chrome = {
      tabs: { createSplit: async () => 99 },
    };
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it("pairs two free tabs in the same window", () => {
    const chat = tab({ id: 2, index: 3 });
    const source = tab({ id: 1, index: 4 });
    expect(canSplitWith(chat, source)).toBe(true);
  });

  it("refuses arrangements split view cannot express", () => {
    const source = tab({ id: 1 });
    expect(canSplitWith(tab({ id: 1 }), source)).toBe(false); // same tab
    expect(canSplitWith(tab({ id: 2, windowId: 11 }), source)).toBe(false);
    expect(canSplitWith(tab({ id: 2, pinned: true }), source)).toBe(false);
    expect(canSplitWith(tab({ id: 2, groupId: 7 }), source)).toBe(false);
    expect(canSplitWith(tab({ id: 2, splitViewId: 5 }), source)).toBe(false);
    expect(canSplitWith(tab({ id: 2 }), tab({ id: 1, splitViewId: 5 }))).toBe(
      false,
    );
  });

  it("does nothing when the browser has no Split View API", () => {
    delete (globalThis as { chrome?: unknown }).chrome;
    expect(canSplitWith(tab({ id: 2 }), tab({ id: 1 }))).toBe(false);
  });

  it("recognises a pair that is already split together", () => {
    expect(
      isSplitTogether(
        tab({ id: 2, splitViewId: 5 }),
        tab({ id: 1, splitViewId: 5 }),
      ),
    ).toBe(true);
    expect(
      isSplitTogether(
        tab({ id: 2, splitViewId: 5 }),
        tab({ id: 1, splitViewId: 6 }),
      ),
    ).toBe(false);
    expect(isSplitTogether(tab({ id: 2 }), tab({ id: 1 }))).toBe(false);
  });

  it("prefers the pane already shown next to the reader's page", () => {
    const source = tab({ id: 1, splitViewId: 5 });
    const pane = tab({ id: 2, splitViewId: 5 });
    const other = tab({ id: 3, active: true });
    // Even an active, session-linked tab loses to the visible pane: opening
    // another conversation would hide the one the user is looking at.
    expect(pickChatTab([other, pane], null, source)).toBe(pane);
    expect(
      pickChatTab(
        [other, pane],
        {
          sourceTabId: 1,
          sourceUrl: "https://example.com",
          chatTabId: 3,
          chatUrl: "https://chat.deepseek.com/",
          updatedAt: Date.now(),
        },
        source,
      ),
    ).toBe(pane);
  });

  it("falls back to the session tab, then the active one, then the newest", () => {
    const session = {
      sourceTabId: 1,
      sourceUrl: "https://example.com",
      chatTabId: 7,
      chatUrl: "https://chat.deepseek.com/",
      updatedAt: Date.now(),
    };
    const first = tab({ id: 5 });
    const second = tab({ id: 6, active: true });
    const own = tab({ id: 7 });
    expect(pickChatTab([first, second, own], session, null)).toBe(own);
    expect(pickChatTab([first, second], session, null)).toBe(second);
    expect(pickChatTab([first, own], null, null)).toBe(own);
    expect(pickChatTab([], session, null)).toBeNull();
  });
});
