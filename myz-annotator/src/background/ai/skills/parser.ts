import { isRecord, type UnknownRecord } from "@myz/shared/typeUtils";
import type { SkillInstruction, SkillMetadata } from "./types.js";

const FRONTMATTER_DELIMITER = "---";
const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function stripQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatterLines(lines: string[]) {
  const frontmatter: UnknownRecord = {};
  let index = 0;
  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    index += 1;
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }
    if (/^\s/.test(rawLine)) {
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    const value = match[2] ?? "";
    if (key === "metadata") {
      const metadata: Record<string, string> = {};
      while (index < lines.length && /^\s/.test(lines[index])) {
        const metaLine = lines[index].trim();
        index += 1;
        if (!metaLine || metaLine.startsWith("#")) {
          continue;
        }
        const metaMatch = metaLine.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!metaMatch) {
          continue;
        }
        const metaKey = metaMatch[1];
        const metaValue = stripQuotes(metaMatch[2] ?? "");
        if (metaKey && metaValue) {
          metadata[metaKey] = metaValue;
        }
      }
      frontmatter.metadata = metadata;
      continue;
    }

    const normalizedValue = stripQuotes(value);
    if (!normalizedValue) {
      frontmatter[key] = "";
      continue;
    }
    frontmatter[key] = normalizedValue;
  }
  return frontmatter;
}

export function splitSkillMarkdown(content: string) {
  const normalized =
    typeof content === "string" ? content.replace(/\r\n/g, "\n") : "";
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return {
      frontmatter: null,
      body: normalized,
      error: "Missing frontmatter",
    };
  }
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === FRONTMATTER_DELIMITER) {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    return {
      frontmatter: null,
      body: normalized,
      error: "Unclosed frontmatter",
    };
  }
  const frontmatterLines = lines.slice(1, endIndex);
  const body = lines
    .slice(endIndex + 1)
    .join("\n")
    .trim();
  return {
    frontmatter: parseFrontmatterLines(frontmatterLines),
    body,
    error: null,
  };
}

export function validateSkillMetadata(frontmatter: UnknownRecord) {
  const errors: string[] = [];
  const name =
    typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
  const description =
    typeof frontmatter.description === "string"
      ? frontmatter.description.trim()
      : "";
  if (!name) {
    errors.push("SKILL.md 缺少 name。");
  } else if (name.length > 64 || !SKILL_NAME_REGEX.test(name)) {
    errors.push(
      "name 必须为 1-64 位小写字母/数字/短横线，且不能以短横线开头或结尾。",
    );
  }

  if (!description) {
    errors.push("SKILL.md 缺少 description。");
  } else if (description.length > 1024) {
    errors.push("description 超过 1024 字符。");
  }

  const compatibility =
    typeof frontmatter.compatibility === "string"
      ? frontmatter.compatibility.trim()
      : "";
  if (compatibility && compatibility.length > 500) {
    errors.push("compatibility 超过 500 字符。");
  }

  return { name, description, errors };
}

export function buildSkillMetadata(
  frontmatter: UnknownRecord,
  now: string,
  existing?: SkillMetadata | null,
): SkillMetadata {
  const metadata = isRecord(frontmatter.metadata)
    ? (Object.fromEntries(
        Object.entries(frontmatter.metadata).filter(
          ([key, value]) =>
            typeof key === "string" &&
            typeof value === "string" &&
            value.trim(),
        ),
      ) as Record<string, string>)
    : undefined;
  const allowedTools =
    typeof frontmatter["allowed-tools"] === "string"
      ? frontmatter["allowed-tools"].trim()
      : "";
  const name =
    typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
  const description =
    typeof frontmatter.description === "string"
      ? frontmatter.description.trim()
      : "";
  return {
    id: name || existing?.id || "",
    name,
    description,
    license:
      typeof frontmatter.license === "string"
        ? frontmatter.license.trim()
        : undefined,
    compatibility:
      typeof frontmatter.compatibility === "string"
        ? frontmatter.compatibility.trim()
        : undefined,
    metadata: metadata && Object.keys(metadata).length ? metadata : undefined,
    allowedTools: allowedTools || undefined,
    enabled: existing?.enabled ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    fileCount: 0,
  };
}

export function buildSkillInstruction(
  skill: SkillMetadata,
  body: string,
): SkillInstruction {
  return {
    name: skill.name,
    description: skill.description,
    body: body.trim(),
  };
}
