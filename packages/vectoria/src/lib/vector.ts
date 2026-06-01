/**
 * Vector utilities with scalar quantization support.
 */

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length")
  }
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10)
}

/**
 * Scalar quantization: float32 → int8.
 * Reduces memory by 75% with minimal accuracy loss.
 */
export function quantizeToInt8(vector: number[]): {
  quantized: Int8Array
  scale: number
  zeroPoint: number
} {
  let min = Infinity
  let max = -Infinity
  for (const v of vector) {
    if (v < min) min = v
    if (v > max) max = v
  }

  const scale = (max - min) / 255
  const zeroPoint = Math.round(-min / scale)

  const quantized = new Int8Array(vector.length)
  for (let i = 0; i < vector.length; i++) {
    quantized[i] = Math.round(vector[i] / scale + zeroPoint) - 128
  }

  return { quantized, scale, zeroPoint }
}

/**
 * Dequantize int8 → float32.
 */
export function dequantizeFromInt8(
  quantized: Int8Array,
  scale: number,
  zeroPoint: number,
): number[] {
  const result = new Array(quantized.length)
  for (let i = 0; i < quantized.length; i++) {
    result[i] = (quantized[i] + 128 - zeroPoint) * scale
  }
  return result
}

/**
 * Compute cosine similarity between int8 quantized vectors.
 * More efficient than dequantizing first.
 */
export function cosineSimilarityInt8(
  a: Int8Array,
  b: Int8Array,
  scaleA: number,
  zeroPointA: number,
  scaleB: number,
  zeroPointB: number,
): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    const va = (a[i] + 128 - zeroPointA) * scaleA
    const vb = (b[i] + 128 - zeroPointB) * scaleB
    dotProduct += va * vb
    normA += va * va
    normB += vb * vb
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10)
}
