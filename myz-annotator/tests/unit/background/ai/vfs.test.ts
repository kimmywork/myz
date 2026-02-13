import { beforeEach, describe, expect, it } from "vitest";
import { installFakeIndexedDB } from "./testUtils.ts";
import { listFiles, readFile, writeFile } from "@/background/ai/vfs.ts";

const setup = installFakeIndexedDB();

beforeEach(() => {
  setup.reset();
});

describe("vfs", () => {
  it("writes and reads files with normalized paths", async () => {
    const record = await writeFile("/foo/../bar.txt", "hello");
    expect(record.path).toBe("bar.txt");
    const read = await readFile("bar.txt");
    expect(read?.content).toBe("hello");
  });

  it("inserts content at specific line", async () => {
    await writeFile("notes.md", "line1\nline3");
    const record = await writeFile("notes.md", "line2", 2);
    expect(record.content).toBe("line1\nline2\nline3");
  });

  it("lists files under directory prefix", async () => {
    await writeFile("a/b/c.txt", "c");
    await writeFile("a/d.txt", "d");
    const files = await listFiles("a");
    expect(files.map((file) => file.path)).toEqual(["a/b/c.txt", "a/d.txt"]);
  });
});
