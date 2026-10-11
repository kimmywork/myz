export function formatDateTime(value: string) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getSearchTerms(input: string): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const terms: string[] = [];
  input
    .split(/\s+/)
    .filter(Boolean)
    .forEach((term: string) => {
      const key = term.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        terms.push(term);
      }
    });
  return terms;
}

export function applySearchHighlights(html: string, terms: string[]) {
  if (!terms.length || !html) return html;
  return terms.reduce((output, term) => {
    const pattern = escapeRegExp(term);
    if (!pattern) return output;
    const regex = new RegExp(`(${pattern})`, "gi");
    return output.replace(regex, '<mark class="search-hit">$1</mark>');
  }, html);
}

export function highlightTermsInHtml(html: string, terms: string[]): string {
  if (!html || !terms.length) return html;
  const pattern = terms
    .map((term) => escapeRegExp(term))
    .filter(Boolean)
    .join("|");
  if (!pattern) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );
  const targets: Node[] = [];
  let current;
  while ((current = walker.nextNode())) {
    if (
      current.parentNode &&
      (current.parentNode as Element).closest("mark.search-hit")
    ) {
      continue;
    }
    targets.push(current);
  }
  targets.forEach((node) => {
    const text = node.nodeValue ?? "";
    const nodeRegex = new RegExp(pattern, "gi");
    if (!nodeRegex.test(text)) return;
    nodeRegex.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    while ((match = nodeRegex.exec(text))) {
      if (match.index > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index)),
        );
      }
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = match[0];
      fragment.appendChild(mark);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    node.parentNode?.replaceChild(fragment, node);
  });
  return container.innerHTML;
}
