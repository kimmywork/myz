import { z } from "zod"

/**
 * Builds the chunk-envelope schema shared by protocol v1 and v2. The two
 * versions only differ in the literal protocol version, so the shape lives
 * here to keep the contract from drifting between them.
 */
export function chunkEnvelopeSchema<T extends string>(protocolVersion: T) {
  return z.object({
    protocolVersion: z.literal(protocolVersion),
    recordId: z.string(),
    updatedAt: z.string(),
    prevHash: z.string(),
    keyId: z.string(),
    recordCipher: z.string(),
    recordNonce: z.string(),
  })
}
