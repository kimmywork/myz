/**
 * Prompt template for the 解读 hand-off.
 *
 * The template is user-editable in settings and uses two placeholders, so the
 * wording can follow the reader's language without touching code:
 *
 *   帮我解读这段文字：
 *
 *   {TEXT}
 *
 *   网页URL： {URL}
 *
 * Rendering is forgiving on purpose: placeholders are case-insensitive, a
 * template without them still produces a usable prompt (the missing parts are
 * appended), and an empty template falls back to the default.
 */

export const AI_PROMPT_TEXT_PLACEHOLDER = "{TEXT}";
export const AI_PROMPT_URL_PLACEHOLDER = "{URL}";

/** Longest template accepted from settings; keeps stored settings sane. */
export const AI_PROMPT_TEMPLATE_MAX_LENGTH = 2000;

/** Default wording, matching the original hard-coded prompt. */
export const DEFAULT_AI_PROMPT_TEMPLATE = [
  "帮我解读这段文字：",
  "",
  AI_PROMPT_TEXT_PLACEHOLDER,
  "",
  `网页URL： ${AI_PROMPT_URL_PLACEHOLDER}`,
].join("\n");

/** Shown in place of the excerpt when the selection only contains images. */
export const AI_IMAGE_ONLY_PLACEHOLDER = "（见随附图片）";

const TEXT_PATTERN = /\{\s*text\s*\}/gi;
const URL_PATTERN = /\{\s*url\s*\}/gi;
const TEXT_TEST = /\{\s*text\s*\}/i;
const URL_TEST = /\{\s*url\s*\}/i;

/** Trim and bound a template coming from settings/UI. */
export function normalizePromptTemplate(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_AI_PROMPT_TEMPLATE;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_AI_PROMPT_TEMPLATE;
  return trimmed.slice(0, AI_PROMPT_TEMPLATE_MAX_LENGTH);
}

export interface AiPromptInput {
  template?: string;
  /** Selected text; empty selections fall back to an image placeholder. */
  text: string;
  /** Page URL the excerpt came from. */
  url: string;
}

/** Fill `{TEXT}` / `{URL}` in the template. */
export function renderAiPrompt({ template, text, url }: AiPromptInput): string {
  const source = normalizePromptTemplate(template);
  const excerpt = text.trim() || AI_IMAGE_ONLY_PLACEHOLDER;
  const hasText = TEXT_TEST.test(source);
  const hasUrl = URL_TEST.test(source);

  let prompt = source
    .replace(TEXT_PATTERN, () => excerpt)
    .replace(URL_PATTERN, () => url);
  if (!hasText) prompt += `\n\n${excerpt}`;
  if (!hasUrl) prompt += `\n\n${url}`;
  return prompt.trim();
}
