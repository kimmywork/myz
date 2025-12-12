import type { MyZRecord } from "../../shared/types.ts";

export function normalizeImportedPayload(
  payload: MyZRecord[] | { highlights?: MyZRecord[]; data?: MyZRecord[] } | any,
): MyZRecord[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.highlights)) {
      return payload.highlights;
    }
    if (Array.isArray(payload.data)) {
      return payload.data;
    }
  }
  return [];
}
