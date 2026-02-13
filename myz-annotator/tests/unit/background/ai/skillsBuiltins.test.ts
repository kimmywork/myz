import { describe, expect, it } from "vitest";
import { isBuiltinSkill, listBuiltinSkillSeeds } from "@/background/ai/skills/builtins.ts";

describe("builtin skills", () => {
  it("lists built-in skill seeds", () => {
    const seeds = listBuiltinSkillSeeds();
    expect(seeds.length).toBeGreaterThan(0);
    const sample = seeds[0];
    expect(sample.record.builtin).toBe(true);
  });

  it("recognizes builtin ids", () => {
    const seeds = listBuiltinSkillSeeds();
    const sampleId = seeds[0]?.id;
    expect(isBuiltinSkill(sampleId)).toBe(true);
    expect(isBuiltinSkill("non-existent-skill")).toBe(false);
  });
});
