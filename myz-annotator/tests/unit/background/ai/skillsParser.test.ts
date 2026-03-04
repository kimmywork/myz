import { describe, expect, it } from "vitest";
import {
  splitSkillMarkdown,
  validateSkillMetadata,
  buildSkillMetadata,
  buildSkillInstruction,
} from "@/background/ai/skills/parser.ts";
import { isRecord } from "@/shared/typeUtils";

const sampleSkill = `---\nname: demo-skill\ndescription: \"A demo skill\"\nmetadata:\n  author: \"me\"\n---\n\n# Title\n\nBody content.`;

describe("skills parser", () => {
  it("splits frontmatter and body", () => {
    const { frontmatter, body, error } = splitSkillMarkdown(sampleSkill);
    expect(error).toBeNull();
    expect(frontmatter?.name).toBe("demo-skill");
    expect(frontmatter?.description).toBe("A demo skill");
    const meta = isRecord(frontmatter?.metadata) ? frontmatter?.metadata : {};
    expect(meta.author).toBe("me");
    expect(body).toContain("Body content");
  });

  it("returns errors for invalid metadata", () => {
    const { errors } = validateSkillMetadata({
      name: "Bad Name",
      description: "",
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("builds metadata and instruction", () => {
    const now = "2025-01-01T00:00:00.000Z";
    const metadata = buildSkillMetadata(
      { name: "demo-skill", description: "Demo", metadata: { foo: "bar" } },
      now,
    );
    expect(metadata.id).toBe("demo-skill");
    expect(metadata.metadata?.foo).toBe("bar");
    const instruction = buildSkillInstruction(metadata, "Use it wisely");
    expect(instruction.body).toBe("Use it wisely");
  });
});
