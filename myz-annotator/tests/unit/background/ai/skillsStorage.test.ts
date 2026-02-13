import { beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeIndexedDB } from "./testUtils.ts";

const skillContent = `---\nname: custom-skill\ndescription: Custom skill\n---\n\nBody content.`;

const updatedSkillContent = `---\nname: custom-skill\ndescription: Updated description\n---\n\nUpdated body.`;

const setup = installFakeIndexedDB();

beforeEach(() => {
  setup.reset();
  vi.resetModules();
});

describe("skills storage", () => {
  it("imports and lists custom skill", async () => {
    const { importSkill, listSkills } = await import("@/background/ai/skills/storage.ts");
    await importSkill({
      rootDir: "custom-skill",
      files: [{ path: "SKILL.md", content: skillContent, encoding: "utf-8" }],
    });

    const skills = await listSkills();
    expect(skills.some((skill) => skill.id === "custom-skill")).toBe(true);
  });

  it("updates enabled state", async () => {
    const { importSkill, updateSkillEnabled } = await import("@/background/ai/skills/storage.ts");
    await importSkill({
      rootDir: "custom-skill",
      files: [{ path: "SKILL.md", content: skillContent, encoding: "utf-8" }],
    });

    const updated = await updateSkillEnabled("custom-skill", false);
    expect(updated.enabled).toBe(false);
  });

  it("updates SKILL.md metadata and instruction", async () => {
    const { importSkill, updateSkillFile, getSkillInstruction } = await import(
      "@/background/ai/skills/storage.ts",
    );
    await importSkill({
      rootDir: "custom-skill",
      files: [{ path: "SKILL.md", content: skillContent, encoding: "utf-8" }],
    });

    await updateSkillFile("custom-skill", "SKILL.md", updatedSkillContent, "utf-8");
    const instruction = await getSkillInstruction("custom-skill");
    expect(instruction?.description).toBe("Updated description");
  });

  it("blocks deletion of builtin skill", async () => {
    const { listSkills, deleteSkill } = await import("@/background/ai/skills/storage.ts");
    const skills = await listSkills();
    const builtin = skills.find((skill) => skill.builtin);
    expect(builtin).toBeTruthy();
    await expect(deleteSkill(builtin!.id)).rejects.toThrow(/不允许删除/);
  });
});
