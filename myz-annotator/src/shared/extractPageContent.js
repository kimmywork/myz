export function extractPageContentForAi() {
  try {
    const MAX_CONTENT_LENGTH = 15000; // Limit content length to avoid token limits

    // Try to find main content using common selectors
    const mainSelectors = [
      "main",
      "article",
      '[role="main"]',
      ".main-content",
      ".post-content",
      ".article-content",
      ".entry-content",
    ];

    let contentElement = null;
    for (const selector of mainSelectors) {
      contentElement = document.querySelector(selector);
      if (contentElement) break;
    }

    if (!contentElement) {
      // Fallback to body but remove obvious noise
      contentElement = document.body.cloneNode(true);
      const noiseSelectors = [
        "nav",
        "header",
        "footer",
        ".nav",
        ".navigation",
        ".menu",
        ".sidebar",
        ".ads",
        ".advertisement",
        ".social-share",
        ".comments",
      ];

      noiseSelectors.forEach((selector) => {
        contentElement.querySelectorAll(selector).forEach((el) => el.remove());
      });
    }

    // Extract text content
    let text = contentElement.textContent || "";

    // Clean up whitespace
    text = text.replace(/\s+/g, " ").trim();

    // Truncate if too long
    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.substring(0, MAX_CONTENT_LENGTH) + "... (content truncated)";
    }

    return {
      text,
      title: document.title || "",
      url: window.location.href,
    };
  } catch (error) {
    console.error("Failed to extract page content:", error);
    return {
      text: "Error extracting content",
      title: document.title || "",
      url: window.location.href,
    };
  }
}
