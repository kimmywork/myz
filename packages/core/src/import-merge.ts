import type { MyZRecord } from "@myz/shared/types";
import { generateRecordId } from "./identity.js";
import {
  applyTimestampFallback,
  buildRecordSignature,
  resolveImportConflict,
  sanitizeImportedHighlight,
  type ImportStrategy,
} from "./import.js";

/** Local id generator: pick a fresh record id not already used. */
function generateUniqueImportId(used: Set<string>): string {
  let candidate = generateRecordId();
  while (used.has(candidate)) candidate = generateRecordId();
  used.add(candidate);
  return candidate;
}

export interface ImportMergeResult {
  replacements: Map<string, MyZRecord>;
  additions: Map<string, MyZRecord>;
  skipped: number;
}

/**
 * Resolve imported records against existing data and within the payload,
 * producing staged replacements/additions. Pure aside from id generation.
 */
export function mergeImportedRecords(
  existingHighlights: Record<string, MyZRecord>,
  records: MyZRecord[],
  strategy: ImportStrategy,
): ImportMergeResult {
  const usedIds = new Set(Object.keys(existingHighlights));
  const existingSignatures = new Set<string>();
  Object.values(existingHighlights).forEach((record) => {
    const signature = buildRecordSignature(record);
    if (signature) existingSignatures.add(signature);
  });

  const replacements: Map<string, MyZRecord> = new Map();
  const additions: Map<string, MyZRecord> = new Map();
  let skipped = 0;

  records.forEach((raw) => {
    const sanitized = sanitizeImportedHighlight(raw);
    if (!sanitized) {
      skipped += 1;
      return;
    }

    const identifier =
      typeof sanitized.id === "string" ? sanitized.id.trim() : "";

    // Handle conflicts with existing highlights first.
    if (
      identifier &&
      existingHighlights[identifier] &&
      !replacements.has(identifier)
    ) {
      const existingRecord = existingHighlights[identifier];
      if (!resolveImportConflict(strategy, existingRecord, sanitized)) {
        skipped += 1;
        return;
      }
      sanitized.id = identifier;
      applyTimestampFallback(sanitized, existingRecord);
      const signature = buildRecordSignature(sanitized);
      if (signature) existingSignatures.add(signature);
      replacements.set(identifier, sanitized);
      return;
    }

    // Conflicts with already staged replacements/additions (duplicate IDs).
    if (
      identifier &&
      (replacements.has(identifier) || additions.has(identifier))
    ) {
      const staged = (replacements.get(identifier) ||
        additions.get(identifier))!;
      if (!resolveImportConflict(strategy, staged, sanitized)) {
        skipped += 1;
        return;
      }
      sanitized.id = identifier;
      applyTimestampFallback(sanitized, staged);
      const signature = buildRecordSignature(sanitized);
      if (signature) existingSignatures.add(signature);
      if (replacements.has(identifier)) {
        replacements.set(identifier, sanitized);
      } else {
        additions.set(identifier, sanitized);
      }
      return;
    }

    // De-duplicate by record signature to avoid creating duplicates.
    const signature = buildRecordSignature(sanitized);
    if (signature && existingSignatures.has(signature)) {
      skipped += 1;
      return;
    }

    let resolvedId = identifier;
    if (!resolvedId || usedIds.has(resolvedId) || additions.has(resolvedId)) {
      resolvedId = generateUniqueImportId(usedIds);
    } else {
      usedIds.add(resolvedId);
    }
    sanitized.id = resolvedId;
    applyTimestampFallback(sanitized);
    sanitized.updatedAt = sanitized.updatedAt || sanitized.createdAt;
    if (signature) existingSignatures.add(signature);
    additions.set(resolvedId, sanitized);
  });

  return { replacements, additions, skipped };
}
