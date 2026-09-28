/**
 * Monotonic anti-rollback marks. New-format streams must reject a manifest
 * whose version is lower than the highest version already observed.
 */
export function isRollback(
  seenVersion: number | null | undefined,
  incomingVersion: number,
): boolean {
  return typeof seenVersion === "number" && incomingVersion < seenVersion
}

export function advanceHighWater(
  seenVersion: number | null | undefined,
  incomingVersion: number,
): number {
  const seen = typeof seenVersion === "number" ? seenVersion : 0
  return incomingVersion > seen ? incomingVersion : seen
}

export function assertNotRollback(
  seenVersion: number | null | undefined,
  incomingVersion: number,
): void {
  if (isRollback(seenVersion, incomingVersion)) {
    throw new Error("Rejected rollback to an older manifest version")
  }
}
