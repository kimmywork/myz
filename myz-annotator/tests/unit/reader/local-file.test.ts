// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  isAbortError,
  isLocalFileAccessError,
  localFileAccessError,
} from "@/reader/local-file";
import { createLocalFileSource } from "@/reader/source";

describe("local file outcomes", () => {
  it("treats a dismissed file picker as an abort, not an error", () => {
    const abort = new DOMException("The user aborted a request.", "AbortError");
    expect(isAbortError(abort)).toBe(true);
    expect(isAbortError(new Error("other"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });

  it("tags a removed handle so callers can intercept the open", () => {
    expect(isLocalFileAccessError(localFileAccessError())).toBe(true);
    expect(isLocalFileAccessError(new Error("需要重新授权"))).toBe(false);
  });

  it("returns null when the picker is cancelled", async () => {
    const picker = vi
      .fn()
      .mockRejectedValue(new DOMException("aborted", "AbortError"));
    vi.stubGlobal("window", { showOpenFilePicker: picker });
    const source = createLocalFileSource({
      description: "PDF",
      accept: {},
      defaultTitle: "PDF",
      getFileHandle: vi.fn(),
      putFileHandle: vi.fn(),
      makeRef: (fingerprint, title) => ({ fingerprint, title }),
    });

    expect(await source.pickLocal()).toBeNull();
    vi.unstubAllGlobals();
  });
});
