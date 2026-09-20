/**
 * Ambient types for Chrome's built-in Translator / Language Detector APIs.
 *
 * `lib.dom` does not ship these yet; a minimal local declaration keeps the
 * engine typed without pulling in an extra `@types` package. The APIs are
 * desktop Chrome 138+ only, so every use is feature-detected at runtime.
 */

export {};

declare global {
  type TranslationAvailabilityValue =
    | "available"
    | "downloadable"
    | "downloading"
    | "unavailable";

  // eslint-disable-next-line no-var
  var Translator:
    | {
        availability(options: {
          sourceLanguage: string;
          targetLanguage: string;
        }): Promise<TranslationAvailabilityValue>;
        create(options: {
          sourceLanguage: string;
          targetLanguage: string;
          monitor?: (monitor: EventTarget) => void;
          signal?: AbortSignal;
        }): Promise<{
          translate(
            input: string,
            options?: { signal?: AbortSignal },
          ): Promise<string>;
          destroy(): void;
        }>;
      }
    | undefined;

  // eslint-disable-next-line no-var
  var LanguageDetector:
    | {
        availability(options?: {
          expectedInputLanguages?: string[];
        }): Promise<TranslationAvailabilityValue>;
        create(options?: {
          expectedInputLanguages?: string[];
          monitor?: (monitor: EventTarget) => void;
          signal?: AbortSignal;
        }): Promise<{
          detect(
            input: string,
            options?: { signal?: AbortSignal },
          ): Promise<{ detectedLanguage: string; confidence: number }[]>;
          destroy(): void;
        }>;
      }
    | undefined;
}
