import { beforeEach, describe, expect, it, vi } from "vitest";

const vfsStore = new Map<string, { path: string; content: string; updatedAt: string }>();

vi.mock("@/background/ai/vfs.js", () => ({
  listFiles: vi.fn(async (dir) => {
    const normalizedDir = typeof dir === "string" ? dir.replace(/^\/+/, "") : "";
    const prefix = normalizedDir ? `${normalizedDir.replace(/\/+$/, "")}/` : "";
    return Array.from(vfsStore.values()).filter((file) =>
      prefix ? file.path.startsWith(prefix) : true,
    );
  }),
  readFile: vi.fn(async (path) => {
    const normalized = typeof path === "string" ? path.replace(/^\/+/, "") : "";
    return vfsStore.get(normalized) || null;
  }),
  writeFile: vi.fn(async (path, content, line) => {
    const normalized = typeof path === "string" ? path.replace(/^\/+/, "") : "";
    let nextContent = content || "";
    const existing = vfsStore.get(normalized);
    if (typeof line === "number" && Number.isFinite(line) && line > 0) {
      const lines = (existing?.content || "").split(/\r?\n/);
      const insertAt = Math.min(lines.length, Math.max(0, Math.floor(line) - 1));
      lines.splice(insertAt, 0, ...nextContent.split(/\r?\n/));
      nextContent = lines.join("\n");
    }
    const record = {
      path: normalized,
      content: nextContent,
      updatedAt: new Date().toISOString(),
    };
    vfsStore.set(normalized, record);
    return record;
  }),
}));

const skillFiles: Record<string, { path: string; content: string; updatedAt: string }[]> = {
  "skill-a": [
    {
      path: "SKILL.md",
      content: "---\nname: skill-a\ndescription: A\n---\nBody",
      updatedAt: "2025-01-01T00:00:00.000Z",
    },
  ],
};

vi.mock("@/background/ai/skills/storage.js", () => ({
  listSkills: vi.fn(async () => [
    { id: "skill-a", name: "skill-a", enabled: true, updatedAt: "2025-01-01T00:00:00.000Z" },
    { id: "skill-b", name: "skill-b", enabled: false, updatedAt: "2025-01-01T00:00:00.000Z" },
  ]),
  listSkillFiles: vi.fn(async (skillId) => {
    return (skillFiles[skillId] || []).map((file) => ({
      skillId,
      path: file.path,
      content: file.content,
      encoding: "utf-8",
      updatedAt: file.updatedAt,
    }));
  }),
  getSkillFile: vi.fn(async (skillId, path) => {
    const file = (skillFiles[skillId] || []).find((item) => item.path === path);
    if (!file) return null;
    return {
      skillId,
      path: file.path,
      content: file.content,
      encoding: "utf-8",
      updatedAt: file.updatedAt,
    };
  }),
}));

const { LOCAL_TOOL_HANDLERS } = await import("@/background/ai/tools/local.ts");

describe("local file tools", () => {
  beforeEach(() => {
    vfsStore.clear();
  });

  it("lists skill root files", async () => {
    const result = await LOCAL_TOOL_HANDLERS.List({ path: "/skills" });
    expect(result.data?.length).toBe(1);
    expect(result.data?.[0]?.path).toContain("/skills/skill-a/SKILL.md");
  });

  it("reads skill file content", async () => {
    const result = await LOCAL_TOOL_HANDLERS.Read({ path: "/skills/skill-a/SKILL.md" });
    expect(result.data?.content).toContain("description: A");
  });

  it("blocks writing into skills directory", async () => {
    const result = await LOCAL_TOOL_HANDLERS.Write({ path: "/skills/skill-a/notes.md", content: "x" });
    expect(result.isError).toBe(true);
  });

  it("writes and edits files", async () => {
    const writeResult = await LOCAL_TOOL_HANDLERS.Write({ path: "notes.md", content: "hello" });
    expect(writeResult.data?.content).toBe("hello");

    const editResult = await LOCAL_TOOL_HANDLERS.Edit({
      path: "notes.md",
      old_string: "hello",
      new_string: "hi",
    });
    expect(editResult.data?.content).toBe("hi");
  });

  it("globs files by pattern", async () => {
    await LOCAL_TOOL_HANDLERS.Write({ path: "docs/a.md", content: "a" });
    await LOCAL_TOOL_HANDLERS.Write({ path: "docs/b.txt", content: "b" });
    const result = await LOCAL_TOOL_HANDLERS.Glob({ pattern: "docs/*.md" });
    expect(result.data?.some((file: any) => file.path === "docs/a.md")).toBe(true);
  });
});
