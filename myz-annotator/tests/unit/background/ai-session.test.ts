import { describe, expect, it } from "vitest";
import { getAiProvider } from "../../../src/ai/providers";
import {
  AI_SESSION_TTL_MS,
  pruneSessions,
  shouldReuseSession,
} from "../../../src/background/ai/session";
import type { AiChatSession } from "../../../src/background/ai/session";

const deepseek = getAiProvider("deepseek");
const NOW = 1_700_000_000_000;

function session(overrides: Partial<AiChatSession> = {}): AiChatSession {
  return {
    sourceTabId: 1,
    sourceUrl: "https://example.com/article",
    chatTabId: 7,
    chatUrl: "https://chat.deepseek.com/",
    updatedAt: NOW,
    ...overrides,
  };
}

function current(overrides: Record<string, unknown> = {}) {
  return {
    sourceTabId: 1,
    sourceUrl: "https://example.com/article",
    chatTabId: 7,
    chatUrl: "https://chat.deepseek.com/",
    ...overrides,
  };
}

describe("AI session reuse", () => {
  it("reuses when nothing changed", () => {
    expect(shouldReuseSession(session(), current(), deepseek, NOW)).toBe(true);
  });

  it("starts over when any held fact changed", () => {
    const next = (overrides: Record<string, unknown>) =>
      shouldReuseSession(session(), current(overrides), deepseek, NOW);
    expect(next({ sourceTabId: 2 })).toBe(false);
    expect(next({ sourceUrl: "https://example.com/other" })).toBe(false);
    expect(next({ chatTabId: 8 })).toBe(false);
    // The one accepted transition (root → conversation) is covered below; a
    // recorded conversation only matches itself exactly.
    expect(
      shouldReuseSession(
        session({ chatUrl: "https://chat.deepseek.com/a/chat/s/abc" }),
        current({ chatUrl: "https://chat.deepseek.com/a/chat/s/other" }),
        deepseek,
        NOW,
      ),
    ).toBe(false);
  });

  it("starts over when there is no record or it expired", () => {
    expect(shouldReuseSession(null, current(), deepseek, NOW)).toBe(false);
    expect(
      shouldReuseSession(
        session({ updatedAt: NOW - AI_SESSION_TTL_MS - 1 }),
        current(),
        deepseek,
        NOW,
      ),
    ).toBe(false);
  });

  it("adopts the conversation URL a completed send produces", () => {
    const conversation = "https://chat.deepseek.com/a/chat/s/abc";
    expect(
      shouldReuseSession(
        session(),
        current({ chatUrl: conversation }),
        deepseek,
        NOW,
      ),
    ).toBe(true);
  });

  it("treats every new-chat route of a provider as the same place", () => {
    const qwen = getAiProvider("qwen");
    expect(
      shouldReuseSession(
        session({ chatUrl: "https://chat.qwen.ai/" }),
        current({ chatUrl: "https://chat.qwen.ai/c/new-chat" }),
        qwen,
        NOW,
      ),
    ).toBe(true);
  });

  it("does not adopt a login page or a different conversation", () => {
    expect(
      shouldReuseSession(
        session(),
        current({ chatUrl: "https://chat.deepseek.com/sign_in" }),
        deepseek,
        NOW,
      ),
    ).toBe(false);
    // Recorded as a conversation already: only the exact same URL is reused.
    expect(
      shouldReuseSession(
        session({ chatUrl: "https://chat.deepseek.com/a/chat/s/abc" }),
        current({ chatUrl: "https://chat.deepseek.com/a/chat/s/xyz" }),
        deepseek,
        NOW,
      ),
    ).toBe(false);
  });
});

describe("session pruning", () => {
  it("drops expired and malformed entries only", () => {
    const map = {
      "1": session({ sourceTabId: 1 }),
      "2": session({ sourceTabId: 2, updatedAt: NOW - AI_SESSION_TTL_MS - 1 }),
      "3": { sourceTabId: 3 } as unknown as AiChatSession,
    };
    expect(Object.keys(pruneSessions(map, NOW))).toEqual(["1"]);
  });
});
