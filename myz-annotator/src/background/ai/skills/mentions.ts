const SKILL_MENTION_REGEX = /(^|\s)@([a-z0-9]+(?:-[a-z0-9]+)*)/g

export function extractSkillMentions(text: string, available: Set<string>) {
  const raw = typeof text === "string" ? text : ""
  if (!raw.trim() || available.size === 0) {
    return []
  }
  const regex = new RegExp(SKILL_MENTION_REGEX)
  const matches = new Set<string>()
  for (const match of raw.matchAll(regex)) {
    const name = match[2]
    if (name && available.has(name)) {
      matches.add(name)
    }
  }
  return Array.from(matches)
}
