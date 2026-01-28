const SKILL_MENTION_REGEX = /(^|\\s)@([a-z0-9]+(?:-[a-z0-9]+)*)/g

export function extractSkillMentions(text: string, available: Set<string>) {
  const raw = typeof text === "string" ? text : ""
  if (!raw.trim() || available.size === 0) {
    return []
  }
  const matches = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = SKILL_MENTION_REGEX.exec(raw)) !== null) {
    const name = match[2]
    if (name && available.has(name)) {
      matches.add(name)
    }
  }
  return Array.from(matches)
}
