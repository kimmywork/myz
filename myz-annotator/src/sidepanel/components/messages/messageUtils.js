export function resolveToolNames(metadata) {
  if (!metadata) return "";
  if (Array.isArray(metadata.toolNames)) {
    return metadata.toolNames.filter(Boolean).join("、");
  }
  if (typeof metadata.toolNames === "string") {
    return metadata.toolNames;
  }
  if (metadata.toolCallCount) {
    return `工具 x${metadata.toolCallCount}`;
  }
  return "";
}
