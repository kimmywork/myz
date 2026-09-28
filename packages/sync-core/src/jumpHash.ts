const JUMP_MULTIPLIER = 2862933555777941757n
const JUMP_MASK = 0xffffffffffffffffn
const TWO_POW_31 = 2147483648

const FNV64_OFFSET = 0xcbf29ce484222325n
const FNV64_PRIME = 0x100000001b3n

/** 32-bit FNV-1a. */
export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** 64-bit FNV-1a, the seed for the jump consistent hash. */
export function fnv1a64(value: string): bigint {
  let hash = FNV64_OFFSET
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index))
    hash = (hash * FNV64_PRIME) & JUMP_MASK
  }
  return hash
}

/**
 * Jump consistent hash (Lamping & Veach). Mapping a key into `[0, buckets)`
 * only remaps ~1/buckets of keys when `buckets` grows by one, unlike modulo
 * hashing which remaps ~half.
 */
export function jumpConsistentHash(key: string, buckets: number): number {
  if (!Number.isInteger(buckets) || buckets <= 0) {
    throw new Error("buckets must be a positive integer")
  }
  const bucketCount = BigInt(buckets)
  let bucket = -1n
  let candidate = 0n
  let hash = fnv1a64(key)
  while (candidate < bucketCount) {
    bucket = candidate
    hash = (hash * JUMP_MULTIPLIER + 1n) & JUMP_MASK
    const high = Number(hash >> 33n)
    const next = Math.floor(Number(bucket + 1n) * (TWO_POW_31 / (high + 1)))
    candidate = BigInt(next)
  }
  return Number(bucket)
}
