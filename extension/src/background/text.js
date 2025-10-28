export function cleanLogseqInline(value) {
  if (!value) {
    return "";
  }
  return String(value).replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
}

export function cleanLogseqMultiline(value) {
  if (!value) {
    return "";
  }
  const lines = String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .split("\n");

  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  const normalized = lines.map((line) =>
    line.replace(/\t/g, "  ").replace(/[\v\f]/g, " ").replace(/\s+$/g, "")
  );

  return normalized.join("\n");
}
