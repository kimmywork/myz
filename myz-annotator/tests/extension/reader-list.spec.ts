import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { setupDashboardHarness } from "../helpers/dashboard-harness.js";

const harness = setupDashboardHarness();

/** Seeds one PDF and one EPUB shortcut straight into the reader databases. */
async function seedReaderProgress(dash: Page) {
  await dash.evaluate(async () => {
    const openDb = (name: string) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("handles")) {
            db.createObjectStore("handles");
          }
          if (!db.objectStoreNames.contains("progress")) {
            db.createObjectStore("progress", { keyPath: "sourceKey" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

    const putProgress = async (dbName: string, value: unknown) => {
      const db = await openDb(dbName);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("progress", "readwrite");
        tx.objectStore("progress").put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    };

    const now = Date.now();
    await putProgress("myz_pdf_db", {
      sourceKey: "myz-pdf:local:fp-pdf",
      sourceType: "pdf",
      page: 2,
      pages: 9,
      title: "Doc PDF",
      fingerprint: "fp-pdf",
      updatedAt: new Date(now).toISOString(),
    });
    await putProgress("myz_epub_db", {
      sourceKey: "myz-epub:local:fp-epub",
      sourceType: "epub",
      spineIndex: 0,
      progression: 0.1,
      title: "Doc EPUB",
      fingerprint: "fp-epub",
      updatedAt: new Date(now - 60_000).toISOString(),
    });
  });
}

test("reader_list_remove_is_undoable_and_clear_history_confirms", async () => {
  const dash = await harness.open("/readers");
  await seedReaderProgress(dash);
  await dash.reload();
  await dash.waitForSelector('[data-testid="reader-row"]');
  await expect(dash.getByTestId("reader-row")).toHaveCount(2);

  // Remove the EPUB shortcut: it leaves the list now, really goes at 6s.
  const epubRow = dash
    .getByTestId("reader-row")
    .filter({ hasText: "Doc EPUB" });
  await epubRow.getByRole("button", { name: "从列表移除" }).click();
  await expect(dash.getByTestId("reader-row")).toHaveCount(1);
  await expect(dash.getByTestId("undo-bar")).toContainText(
    "已从列表移除「Doc EPUB」",
  );

  await dash
    .getByTestId("undo-bar")
    .getByRole("button", { name: "撤销" })
    .click();
  await expect(dash.getByTestId("reader-row")).toHaveCount(2);

  // Clear history: themed confirmation, no undo, empties the list.
  await dash.getByRole("button", { name: "清空历史" }).click();
  const confirm = dash.locator(".myz-confirm");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "清空历史" }).click();
  await expect(dash.getByTestId("reader-row")).toHaveCount(0);
  await expect(dash.getByText("还没有打开过文档")).toBeVisible();
  await expect(dash.getByTestId("undo-bar")).toHaveCount(0);
});
