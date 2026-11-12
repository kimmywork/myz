// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  classifyPage,
  evaluatePage,
  looksEndlessByLayout,
} from "@/content/snapshot/page-eligibility";

describe("endless-scroll site rules", () => {
  it("blocks the X timeline surfaces", () => {
    for (const url of [
      "https://x.com/home",
      "https://twitter.com/home",
      "https://x.com/explore",
      "https://x.com/search?q=myz",
      "https://x.com/notifications",
      "https://x.com/someuser",
    ]) {
      expect(classifyPage(url).capture).toBe(false);
    }
  });

  it("allows a single X post page inside the same host", () => {
    const result = classifyPage("https://x.com/someuser/status/1234567890");
    expect(result.capture).toBe(true);
    expect(result.rule).toBe("x-status");
  });

  it("blocks feeds and allows single posts on the same hosts", () => {
    expect(classifyPage("https://weibo.com/hot").capture).toBe(false);
    expect(classifyPage("https://weibo.com/").capture).toBe(false);
    expect(classifyPage("https://weibo.com/detail/123456").capture).toBe(true);

    expect(classifyPage("https://www.reddit.com/r/webdev/").capture).toBe(
      false,
    );
    expect(
      classifyPage("https://www.reddit.com/r/webdev/comments/abc123/title/")
        .capture,
    ).toBe(true);

    expect(classifyPage("https://tieba.baidu.com/f?kw=myz").capture).toBe(
      false,
    );
    expect(classifyPage("https://tieba.baidu.com/p/1234567").capture).toBe(
      true,
    );
  });

  it("allows ordinary article pages, including look-alikes", () => {
    for (const url of [
      "https://example.com/blog/post",
      "https://en.wikipedia.org/wiki/Color",
      "https://www.ruanyifeng.com/blog/2024/01/weekly-issue-287.html",
      // Mentioning x.com in a path is not the X timeline.
      "https://example.com/posts/x.com/home",
    ]) {
      expect(classifyPage(url).capture).toBe(true);
    }
  });

  it("gives the user a reason when it refuses", () => {
    const result = classifyPage("https://x.com/home");
    expect(result.capture).toBe(false);
    expect(result.reason).toContain("无限滚动");
  });
});

describe("layout fallback", () => {
  it("flags a very tall page with almost no visible text", () => {
    expect(
      looksEndlessByLayout({
        scrollHeight: 40_000,
        viewportHeight: 800,
        visibleTextLength: 50,
      }),
    ).toBe(true);
  });

  it("leaves a long article alone", () => {
    // Same height, but the first screen is full of text.
    expect(
      looksEndlessByLayout({
        scrollHeight: 40_000,
        viewportHeight: 800,
        visibleTextLength: 1200,
      }),
    ).toBe(false);
  });

  it("leaves a short page alone", () => {
    expect(
      looksEndlessByLayout({
        scrollHeight: 2400,
        viewportHeight: 800,
        visibleTextLength: 0,
      }),
    ).toBe(false);
  });

  it("is only used when measurements are supplied", () => {
    const tall = {
      scrollHeight: 40_000,
      viewportHeight: 800,
      visibleTextLength: 10,
    };
    expect(evaluatePage("https://example.com/post").capture).toBe(true);
    expect(evaluatePage("https://example.com/post", tall).capture).toBe(false);
  });
});
