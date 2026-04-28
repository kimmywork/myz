import { describe, expect, it } from "vitest";
import {
  isBuiltinSkill,
  listBuiltinSkillSeeds,
} from "@/background/ai/skills/builtins.ts";

describe("builtin skills", () => {
  it("lists built-in skill seeds", () => {
    const seeds = listBuiltinSkillSeeds();
    expect(seeds.length).toBe(2);
    expect(seeds.every((seed) => seed.record.builtin === true)).toBe(true);
    const ids = seeds.map((seed) => seed.id).sort();
    expect(ids).toEqual(["browser-operations", "planning-mode"]);
  });

  it("recognizes builtin ids", () => {
    const seeds = listBuiltinSkillSeeds();
    const sampleId = seeds[0]?.id;
    expect(isBuiltinSkill(sampleId)).toBe(true);
    expect(isBuiltinSkill("non-existent-skill")).toBe(false);
  });
});
