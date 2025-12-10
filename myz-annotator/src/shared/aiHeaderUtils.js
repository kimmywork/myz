export function parseAiRequestHeaders(rawHeaders) {
  if (!rawHeaders || typeof rawHeaders !== "string") {
    return {};
  }

  return rawHeaders
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((headers, line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        return headers;
      }
      const key = line.slice(0, separatorIndex).trim();
      if (!key) {
        return headers;
      }
      const value = line.slice(separatorIndex + 1).trim();
      headers[key] = value;
      return headers;
    }, {});
}

export function getAiHeaderValue(rawHeaders, targetName) {
  if (!targetName) {
    return undefined;
  }
  const headers = parseAiRequestHeaders(rawHeaders);
  const lowerTarget = targetName.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === lowerTarget) {
      return value;
    }
  }
  return undefined;
}
