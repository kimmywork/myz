export function parseAiRequestHeaders(rawHeaders?: string): Record<string, string> {
  if (typeof rawHeaders !== "string") {
    return {};
  }
  return rawHeaders
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((headers, line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        return headers;
      }
      const key = line.slice(0, separatorIndex).trim();
      if (!key) {
        return headers;
      }
      headers[key] = line.slice(separatorIndex + 1).trim();
      return headers;
    }, {});
}

export function getAiHeaderValue(rawHeaders?: string, targetName?: string): string | undefined {
  if (!targetName) {
    return undefined;
  }
  const lowerTarget = targetName.toLowerCase();
  return Object.entries(parseAiRequestHeaders(rawHeaders)).find(
    ([name]) => name.toLowerCase() === lowerTarget,
  )?.[1];
}
