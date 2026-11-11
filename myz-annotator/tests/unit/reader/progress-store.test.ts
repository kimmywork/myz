// @vitest-environment node
import "fake-indexeddb/auto";
import { SOURCE_TYPES } from "@myz/shared/types";
import { describe, expect, it } from "vitest";
import {
  createProgressStore,
  epubProgressStore,
  isPdfProgress,
  listReaderProgress,
  pdfProgressStore,
  type EpubProgress,
} from "@/reader/progress-store.js";

describe("createProgressStore", () => {
  it("round-trips file handles and progress records", async () => {
    const store = createProgressStore<EpubProgress>("myz_test_progress_db");
    const handle = { name: "book.epub" };
    await store.putFileHandle("fp-1", handle);
    await expect(store.getFileHandle("fp-1")).resolves.toEqual(handle);

    const progress: EpubProgress = {
      sourceKey: "myz-epub:fp-1",
      sourceType: SOURCE_TYPES.EPUB,
      spineIndex: 3,
      progression: 0.25,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await store.saveProgress(progress);
    await expect(store.getProgress("myz-epub:fp-1")).resolves.toEqual(progress);
  });

  it("lists progress newest first", async () => {
    const store = createProgressStore<EpubProgress>(
      "myz_test_progress_list_db",
    );
    await store.saveProgress({
      sourceKey: "myz-epub:old",
      sourceType: SOURCE_TYPES.EPUB,
      spineIndex: 0,
      progression: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await store.saveProgress({
      sourceKey: "myz-epub:new",
      sourceType: SOURCE_TYPES.EPUB,
      spineIndex: 0,
      progression: 0,
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    const list = await store.listProgress();
    expect(list.map((entry) => entry.sourceKey)).toEqual([
      "myz-epub:new",
      "myz-epub:old",
    ]);
  });
});

describe("readerProgress facade", () => {
  it("merges PDF and EPUB progress, newest first", async () => {
    await pdfProgressStore.saveProgress({
      sourceKey: "myz-pdf:a",
      sourceType: SOURCE_TYPES.PDF,
      page: 3,
      pages: 10,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    await epubProgressStore.saveProgress({
      sourceKey: "myz-epub:b",
      sourceType: SOURCE_TYPES.EPUB,
      spineIndex: 1,
      progression: 0.2,
      updatedAt: "2026-01-03T00:00:00.000Z",
    });

    const list = await listReaderProgress();
    expect(list.map((entry) => entry.sourceKey)).toEqual([
      "myz-epub:b",
      "myz-pdf:a",
    ]);
    expect(list.some(isPdfProgress)).toBe(true);
    expect(list.some((entry) => !isPdfProgress(entry))).toBe(true);
  });
});

describe("removeProgress / clearProgress", () => {
  it("removes one progress row and its fingerprint-keyed handle", async () => {
    const store = createProgressStore<EpubProgress>(
      "myz_test_progress_remove_db",
    );
    await store.putFileHandle("fp-handle", { name: "book.epub" });
    await store.saveProgress({
      sourceKey: "myz-epub:local:fp-handle",
      sourceType: SOURCE_TYPES.EPUB,
      spineIndex: 0,
      progression: 0,
      fingerprint: "fp-handle",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await store.removeProgress("myz-epub:local:fp-handle", "fp-handle");

    await expect(
      store.getProgress("myz-epub:local:fp-handle"),
    ).resolves.toBeUndefined();
    await expect(store.getFileHandle("fp-handle")).resolves.toBeUndefined();
  });

  it("clears every progress row and handle", async () => {
    const store = createProgressStore<EpubProgress>(
      "myz_test_progress_clear_db",
    );
    await store.putFileHandle("fp-1", { name: "one.epub" });
    await store.saveProgress({
      sourceKey: "myz-epub:local:fp-1",
      sourceType: SOURCE_TYPES.EPUB,
      spineIndex: 1,
      progression: 0.1,
      fingerprint: "fp-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await store.clearProgress();

    await expect(store.listProgress()).resolves.toEqual([]);
    await expect(store.getFileHandle("fp-1")).resolves.toBeUndefined();
  });
});
