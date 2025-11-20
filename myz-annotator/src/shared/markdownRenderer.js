import MarkdownIt from "markdown-it";

// Create a markdown renderer instance
const md = new MarkdownIt({
  html: false, // Disable HTML tags for security
  breaks: true, // Convert '\n' to <br>
  linkify: true, // Autoconvert URL-like text to links
  typographer: true, // Enable smart quotes and other typographic replacements
});

// Add target="_blank" to all links
const defaultRender =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  // Add target="_blank" to all links
  tokens[idx].attrPush(["target", "_blank"]);
  // Add rel="noopener noreferrer" for security
  tokens[idx].attrPush(["rel", "noopener noreferrer"]);
  return defaultRender(tokens, idx, options, env, self);
};

/**
 * Render markdown text to HTML
 * @param {string} text - The markdown text to render
 * @returns {string} - Rendered HTML string
 */
export function renderMarkdown(text) {
  if (!text) return "";
  return md.render(text);
}

/**
 * Check if text contains markdown
 * @param {string} text - The text to check
 * @returns {boolean} - True if text contains markdown syntax
 */
export function hasMarkdown(text) {
  if (!text) return false;
  // Simple check for common markdown patterns
  const patterns = [
    /[#\*\-_>\[\]`]/, // Headers, bold/italic, lists, quotes, links, code
    /\n\s*\n/, // Multiple line breaks (paragraphs)
  ];
  return patterns.some((pattern) => pattern.test(text));
}
