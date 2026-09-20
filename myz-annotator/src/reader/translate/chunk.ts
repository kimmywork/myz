/**
 * Sentence/paragraph chunking for the Translator API.
 *
 * Translations are processed sequentially and very long inputs can exceed the
 * model's input quota, so long selections are translated chunk by chunk —
 * which also lets each finished chunk show up (and be cached) immediately.
 */

export const DEFAULT_CHUNK_LENGTH = 320;

/**
 * Sentence terminators for CJK and Latin scripts. A Latin period only ends a
 * sentence when followed by whitespace or the end of the string, so decimals
 * and abbreviations (e.g. "3.14") are not split mid-number.
 */
const SENTENCE_BOUNDARY =
  /([。！？；]+[”"』」）)]*|(?:[.!?]+)(?=\s|$)[”"』」）)]*|\n+)/;

function hardWrap(text: string, maxLength: number): string[] {
  const pieces: string[] = [];
  for (let index = 0; index < text.length; index += maxLength) {
    const piece = text.slice(index, index + maxLength).trim();
    if (piece) {
      pieces.push(piece);
    }
  }
  return pieces;
}

/**
 * Splits text into chunks no longer than `maxLength` characters, preferring
 * sentence boundaries and never dropping a character (aside from surrounding
 * whitespace).
 */
export function splitIntoChunks(
  text: string,
  maxLength = DEFAULT_CHUNK_LENGTH,
): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return [];
  }
  if (maxLength <= 0 || normalized.length <= maxLength) {
    return [normalized];
  }

  const sentences: string[] = [];
  let rest = normalized;
  while (rest) {
    const match = rest.match(SENTENCE_BOUNDARY);
    if (!match || match.index === undefined) {
      sentences.push(rest);
      break;
    }
    const end = match.index + match[0].length;
    sentences.push(rest.slice(0, end));
    rest = rest.slice(end);
  }

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    const value = current.trim();
    if (value) {
      chunks.push(value);
    }
    current = "";
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) {
      continue;
    }
    if (sentence.length > maxLength) {
      flush();
      chunks.push(...hardWrap(sentence, maxLength));
      continue;
    }
    if ((current + sentence).length > maxLength) {
      flush();
    }
    current += sentence;
  }
  flush();

  return chunks;
}
