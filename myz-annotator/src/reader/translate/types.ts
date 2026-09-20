/**
 * On-device translation engine contract.
 *
 * The browser's Translator / Language Detector APIs are the only real
 * implementation, but every consumer depends on this interface so tests can
 * inject a mock and a future user-supplied provider can slot in beside the
 * built-in engine without touching the UI.
 */

export type TranslationAvailability =
  "available" | "downloadable" | "downloading" | "unavailable";

export interface DetectedLanguage {
  detectedLanguage: string;
  confidence: number;
}

export interface PrepareOptions {
  /**
   * Download progress in the 0..1 range.
   *
   * There is deliberately no `AbortSignal` here: per spec, aborting a signal
   * passed to `create()` after it fulfills destroys the created instance, so
   * cancellation lives on the per-method `translate()`/`detect()` calls.
   */
  onProgress?: (loaded: number) => void;
}

export interface TranslationEngine {
  /** Whether a source→target pair can be translated right now. */
  availability(
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<TranslationAvailability>;
  /** Runs language detection. Resolves to an empty list when unsupported. */
  detect(text: string, signal?: AbortSignal): Promise<DetectedLanguage[]>;
  /** Creates (or reuses) the translator for a pair, downloading if needed. */
  ensureTranslator(
    sourceLanguage: string,
    targetLanguage: string,
    options?: PrepareOptions,
  ): Promise<void>;
  /** Translates a single chunk. Callers chunk long text themselves. */
  translate(
    sourceLanguage: string,
    targetLanguage: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<string>;
  /** Releases every translator/detector held by the engine. */
  destroy(): void;
}
