export function normalizeImportedPayload(payload) {
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
