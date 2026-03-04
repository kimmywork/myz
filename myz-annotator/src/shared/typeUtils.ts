export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type JsonRecord = Record<string, JsonValue>
export type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (typeof value === "string" || typeof value === "number") return true
  if (typeof value === "boolean") return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue)
  }
  return false
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

export function toJsonRecord(
  value: unknown,
  fallback: JsonRecord = {},
): JsonRecord {
  return isJsonRecord(value) ? value : fallback
}

export function toJsonValue(
  value: unknown,
  fallback: JsonValue = null,
): JsonValue {
  return isJsonValue(value) ? value : fallback
}

export function isString(value: unknown): value is string {
  return typeof value === "string"
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}
