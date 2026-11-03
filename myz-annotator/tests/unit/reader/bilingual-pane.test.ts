import { beforeEach, describe, expect, it } from "vitest";
import {
  createBilingualPane,
  type BilingualBlock,
} from "@/reader/bilingual-pane.js";
import type {
  BilingualEvent,
  BilingualSegment,
  BilingualSession,
  BilingualSnapshot,
} from "@/reader/translate/bilingual.js";

function createStubSession() {
  const listeners = new Set<(event: BilingualEvent) => void>();
  const translations = new Map<string, string>();
  const requests: BilingualSegment[][] = [];

  const session: BilingualSession = {
    request(segments) {
      requests.push(segments);
    },
    cancel() {},
    setTargetLanguage() {},
    redetect() {},
    retry() {},
    translationFor: (key) => translations.get(key),
    snapshot: (): BilingualSnapshot => ({
      phase: "idle",
      sourceLanguage: "",
      targetLanguage: "zh",
      error: "",
      translated: 0,
      pending: 0,
      downloadProgress: 0,
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {},
  };

  return {
    session,
    requests,
    emit(event: BilingualEvent) {
      for (const listener of listeners) listener(event);
    },
    translate(key: string, translation: string) {
      translations.set(key, translation);
      this.emit({ type: "block", key, translation });
    },
    listenerCount: () => listeners.size,
  };
}

const BLOCKS: BilingualBlock[] = [
  { key: "one", text: "one", top: 0, height: 40 },
  { key: "two", text: "two", top: 100, height: 20 },
];

describe("createBilingualPane", () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.replaceChildren();
    container = document.createElement("div");
    document.body.append(container);
  });

  it("renders one block per source block with its source geometry", () => {
    const stub = createStubSession();
    const pane = createBilingualPane({
      container: () => container,
      session: stub.session,
    });
    pane.render(BLOCKS);

    const nodes = container.querySelectorAll<HTMLElement>(
      ".myz-bilingual__block",
    );
    expect(nodes).toHaveLength(2);
    expect(nodes[0].style.minHeight).toBe("40px");
    expect(nodes[1].style.minHeight).toBe("20px");
    expect(nodes[0].dataset.state).toBe("idle");
    // jsdom reports zero-height boxes, so the column ends at the last top.
    expect(container.style.height).toBe("100px");
    pane.dispose();
  });

  it("requests only the blocks the predicate accepts", () => {
    const stub = createStubSession();
    const pane = createBilingualPane({
      container: () => container,
      session: stub.session,
    });
    pane.render(BLOCKS);
    pane.requestVisible((block) => block.key === "two");

    expect(stub.requests).toEqual([[{ key: "two", text: "two" }]]);
    const two = container.querySelector<HTMLElement>('[data-block-key="two"]');
    expect(two?.dataset.state).toBe("pending");
    pane.dispose();
  });

  it("pins blocks to their exact source position in anchored mode", () => {
    const stub = createStubSession();
    const pane = createBilingualPane({
      container: () => container,
      session: stub.session,
      mode: "anchored",
      minHeight: () => 500,
    });
    pane.render([
      { key: "a", text: "a", top: 20, height: 30, left: 40, width: 100 },
      { key: "b", text: "b", top: 24, height: 30, left: 300, width: 100 },
      { key: "c", text: "c", top: 80, height: 30, left: 40, width: 100 },
    ]);

    const nodes = container.querySelectorAll<HTMLElement>(
      ".myz-bilingual__block",
    );
    // A block is never pushed by an earlier one: two-column pages stay
    // interleaved instead of collapsing into one reading order.
    expect(nodes[0].style.top).toBe("20px");
    expect(nodes[1].style.top).toBe("24px");
    expect(nodes[2].style.top).toBe("80px");
    expect(nodes[1].style.left).toBe("300px");
    expect(nodes[1].style.width).toBe("100px");
    expect(container.style.height).toBe("500px");
    pane.dispose();
  });

  it("drops the pending shimmer when a batch fails", () => {
    const stub = createStubSession();
    const pane = createBilingualPane({
      container: () => container,
      session: stub.session,
    });
    pane.render(BLOCKS);
    pane.requestVisible(() => true);
    const one = container.querySelector<HTMLElement>('[data-block-key="one"]');
    expect(one?.dataset.state).toBe("pending");

    stub.emit({
      type: "state",
      snapshot: {
        phase: "error",
        sourceLanguage: "en",
        targetLanguage: "zh",
        error: "翻译失败，请重试",
        translated: 0,
        pending: 0,
        downloadProgress: 0,
      },
    });
    expect(one?.dataset.state).toBe("idle");
    pane.dispose();
  });

  it("fills in translations as they arrive and keeps them after a reset", () => {
    const stub = createStubSession();
    const pane = createBilingualPane({
      container: () => container,
      session: stub.session,
    });
    pane.render(BLOCKS);

    stub.translate("one", "第一段");
    const one = container.querySelector<HTMLElement>('[data-block-key="one"]');
    expect(one?.textContent).toBe("第一段");
    expect(one?.dataset.state).toBe("done");

    stub.emit({ type: "reset" });
    expect(one?.textContent).toBe("");
    expect(one?.dataset.state).toBe("idle");
    pane.dispose();
  });

  it("paints blocks already in the session when re-rendered", () => {
    const stub = createStubSession();
    stub.translate("two", "第二段");
    const pane = createBilingualPane({
      container: () => container,
      session: stub.session,
    });
    pane.render(BLOCKS);

    const two = container.querySelector<HTMLElement>('[data-block-key="two"]');
    expect(two?.textContent).toBe("第二段");
    expect(two?.dataset.state).toBe("done");
    pane.dispose();
  });

  it("stops listening once disposed", () => {
    const stub = createStubSession();
    const pane = createBilingualPane({
      container: () => container,
      session: stub.session,
    });
    pane.render(BLOCKS);
    expect(stub.listenerCount()).toBe(1);
    pane.dispose();
    expect(stub.listenerCount()).toBe(0);
    expect(container.children).toHaveLength(0);
  });
});
