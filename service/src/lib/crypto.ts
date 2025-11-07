import crypto from "node:crypto";

const { createHash, randomBytes, timingSafeEqual } = crypto;

const DEFAULT_TOKEN_BYTES = 32;

export function generateToken(bytes = DEFAULT_TOKEN_BYTES): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyTokenHash(token: string, hash: string): boolean {
  const computed = hashToken(token);

  const bufferA = Buffer.from(computed, "hex");
  const bufferB = Buffer.from(hash, "hex");

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}
