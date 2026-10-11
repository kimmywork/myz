export type ImportFileFormat =
  "json" | "raindrop" | "chrome-bookmarks" | "weava";

export type ImportSource =
  "auto" | "myz-json" | "raindrop-csv" | "chrome-bookmarks" | "weava-csv";

/** Detect the import format from an explicit source or the file/text shape. */
export function resolveImportFileFormat(
  file: File | undefined,
  text: string,
  source: ImportSource,
): ImportFileFormat | null {
  if (source !== "auto") {
    if (source === "myz-json") return "json";
    if (source === "raindrop-csv") return "raindrop";
    if (source === "weava-csv") return "weava";
    return "chrome-bookmarks";
  }

  const name = file?.name?.toLowerCase() || "";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    return "chrome-bookmarks";
  }

  const type = file?.type?.toLowerCase() || "";
  if (type.includes("json")) return "json";
  if (type.includes("html")) return "chrome-bookmarks";

  const isCsv = name.endsWith(".csv") || type.includes("csv");

  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1")) {
    return "chrome-bookmarks";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";

  const headerLine = trimmed.split(/\r?\n/, 1)[0]?.toLowerCase() || "";
  if (isCsv || headerLine.includes("url")) {
    if (
      headerLine.includes("website title") ||
      headerLine.includes("highlighted text")
    ) {
      return "weava";
    }
    if (headerLine.includes("url") && headerLine.includes("created")) {
      return "raindrop";
    }
    if (isCsv) return "raindrop";
  }

  return null;
}
