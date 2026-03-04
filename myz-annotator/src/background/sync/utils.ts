import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { isRecord } from "@/shared/typeUtils";

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function base32Encode(bytes: Uint8Array): string {
  let output = "";
  let value = 0;
  let bits = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      const index = (value >>> (bits - 5)) & 31;
      output += BASE32_ALPHABET[index];
      bits -= 5;
    }
  }
  if (bits > 0) {
    const index = (value << (5 - bits)) & 31;
    output += BASE32_ALPHABET[index];
  }
  return output;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return output;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([key]) => key !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const result: Record<string, unknown> = {};
    entries.forEach(([key, val]) => {
      result[key] = stableValue(val);
    });
    return result;
  }
  return value;
}

export function encodeBinaryPayload(value: unknown): Uint8Array {
  const json = stableStringify(value);
  const bytes = strToU8(json);
  return deflateSync(bytes, { level: 6 });
}

export function decodeBinaryPayload(payload: Uint8Array): unknown {
  const inflated = inflateSync(payload);
  const json = strFromU8(inflated);
  return JSON.parse(json);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer) {
    if (
      bytes.byteOffset === 0 &&
      bytes.byteLength === bytes.buffer.byteLength
    ) {
      return bytes.buffer;
    }
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  }
  return Uint8Array.from(bytes).buffer;
}
