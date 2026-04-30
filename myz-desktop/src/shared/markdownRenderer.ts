import MarkdownIt from "markdown-it"

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true,
})

const defaultRender =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  tokens[idx].attrPush(["target", "_blank"])
  tokens[idx].attrPush(["rel", "noopener noreferrer"])
  return defaultRender(tokens, idx, options, env, self)
}

export function renderMarkdown(text: string): string {
  if (!text) return ""
  return md.render(text)
}
