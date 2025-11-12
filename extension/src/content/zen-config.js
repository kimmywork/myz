// Developers can extend this mapping to target the correct article element
// on non-standard sites. The first matching rule wins.
// pattern: string substring match or RegExp; selector: CSS selector string.
export const ZEN_SELECTOR_MAP = [
  // Example: our test fixture
  { pattern: /article-mapped\.html$/, selector: "#special-article" },
  // Gcores article pages
  { pattern: /:\/\/(?:www\.)?gcores\.com\/articles\/\d+/, selector: ".articlePage" },
  // Add more rules as needed, e.g.
  // { pattern: /example\.com/, selector: "main .article" },
];
