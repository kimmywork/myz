import { describe, expect, it, vi } from "vitest";

describe("extractSkillMentions", () => {
  it("extracts mentions that exist in available list", async () => {
    vi.resetModules();
    const { extractSkillMentions } = await import(
      "@/background/ai/skills/mentions.ts"
    );
    const available = new Set(["alpha", "beta-skill"]);
    const text = "@alpha @beta-skill @missing";
    expect(extractSkillMentions(text, available).sort()).toEqual([
      "alpha",
      "beta-skill",
    ]);
  });

  it("returns empty when no matches", async () => {
    vi.resetModules();
    const { extractSkillMentions } = await import(
      "@/background/ai/skills/mentions.ts"
    );
    expect(extractSkillMentions("no mentions", new Set(["a"]))).toEqual([]);
  });
});
